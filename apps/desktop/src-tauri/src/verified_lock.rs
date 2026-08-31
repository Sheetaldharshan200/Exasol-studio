//! Remotely-updatable VERIFIED component lock.
//!
//! Studio ships a baked `runtime-components.lock.json` (the verified set, with a
//! SHA per binary). To let verified versions advance WITHOUT a full app release,
//! Studio can also fetch a signed lock from a trusted URL: the fetched JSON is
//! accepted only when its detached ed25519 signature verifies against the public
//! key embedded below AND it is newer than the baked one, with the same schema.
//! Anything unsigned, mis-signed, malformed, older, or schema-mismatched is
//! ignored and the baked lock stands — a hostile or broken host can never
//! downgrade or poison the verified set. This is the linchpin that makes
//! verify-or-refuse binary/DB updates independent of app releases.

use std::path::{Path, PathBuf};

use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};

use crate::component_lock::RuntimeComponents;
use crate::error::AppResult;

/// ed25519 public key (32 bytes, hex) that signs the verified lock. EMPTY on
/// purpose: until the real deployed key is set here, signature verification
/// always fails and Studio uses only the baked lock (the safe default). Set this
/// to the published public key to enable remote verified-lock updates.
const VERIFIED_LOCK_PUBKEY_HEX: &str = "";

/// Where the signed lock lives; its detached signature is the same URL + ".sig"
/// (base64 of the 64-byte ed25519 signature). Configurable — hosting is ops.
pub const VERIFIED_LOCK_URL: &str =
    "https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/verified-lock/runtime-components.lock.json";

fn embedded_pubkey() -> Option<VerifyingKey> {
    decode_pubkey(VERIFIED_LOCK_PUBKEY_HEX)
}

fn decode_pubkey(hex: &str) -> Option<VerifyingKey> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for (i, slot) in bytes.iter_mut().enumerate() {
        *slot = u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    VerifyingKey::from_bytes(&bytes).ok()
}

/// Verify a detached ed25519 signature over `lock_bytes` with a given key.
/// False on ANY problem (wrong sig length, bad signature). Pure + testable.
fn verify_with(lock_bytes: &[u8], sig_bytes: &[u8], vk: &VerifyingKey) -> bool {
    let Ok(sig_arr) = <[u8; 64]>::try_from(sig_bytes) else {
        return false;
    };
    vk.verify_strict(lock_bytes, &Signature::from_bytes(&sig_arr)).is_ok()
}

/// Verify against the embedded public key. False when no key is configured
/// (so an unconfigured build never trusts a fetched lock).
pub fn verify_lock(lock_bytes: &[u8], sig_bytes: &[u8]) -> bool {
    match embedded_pubkey() {
        Some(vk) => verify_with(lock_bytes, sig_bytes, &vk),
        None => false,
    }
}

/// True when `remote` is a strictly later RFC3339 timestamp than `baked`.
fn date_is_newer(remote: &str, baked: &str) -> bool {
    match (
        chrono::DateTime::parse_from_rfc3339(remote),
        chrono::DateTime::parse_from_rfc3339(baked),
    ) {
        (Ok(r), Ok(b)) => r > b,
        _ => false,
    }
}

/// The later of two RFC3339 timestamps (falls back to `a` if either is unparseable
/// in a way that makes `b` not provably newer). Used for the monotonic floor.
fn newer_of(a: String, b: String) -> String {
    if date_is_newer(&b, &a) {
        b
    } else {
        a
    }
}

fn cache_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("verified-lock")
}
fn cached_lock(data_dir: &Path) -> PathBuf {
    cache_dir(data_dir).join("runtime-components.lock.json")
}
fn cached_sig(data_dir: &Path) -> PathBuf {
    cache_dir(data_dir).join("runtime-components.lock.json.sig")
}

/// The `generated_at` of the currently-cached override, but only if it still
/// verifies + parses — the anti-downgrade floor. None when there's no valid
/// cache.
fn cached_generated_at(data_dir: &Path) -> Option<String> {
    let lock_bytes = std::fs::read(cached_lock(data_dir)).ok()?;
    let sig_bytes = std::fs::read(cached_sig(data_dir)).ok()?;
    if !verify_lock(&lock_bytes, &sig_bytes) {
        return None;
    }
    serde_json::from_slice::<RuntimeComponents>(&lock_bytes)
        .ok()
        .map(|p| p.generated_at)
}

/// The monotonic freshness floor: the later of the baked lock and the highest
/// lock already accepted into the cache. A fetched lock must beat this, so a
/// host can't downgrade/replay an older (e.g. revoked) but still-validly-signed
/// lock once a newer one has been seen.
fn freshness_floor(baked: &RuntimeComponents, data_dir: &Path) -> String {
    match cached_generated_at(data_dir) {
        Some(cached) => newer_of(baked.generated_at.clone(), cached),
        None => baked.generated_at.clone(),
    }
}

/// The cached remote lock, but ONLY if its signature verifies, it parses, its
/// schema matches, and it is newer than `baked`. Otherwise None → baked stands.
pub fn resolve_override(baked: &RuntimeComponents, data_dir: &Path) -> Option<RuntimeComponents> {
    let lock_bytes = std::fs::read(cached_lock(data_dir)).ok()?;
    let sig_bytes = std::fs::read(cached_sig(data_dir)).ok()?;
    if !verify_lock(&lock_bytes, &sig_bytes) {
        return None;
    }
    let parsed: RuntimeComponents = serde_json::from_slice(&lock_bytes).ok()?;
    if parsed.schema_version != baked.schema_version {
        return None;
    }
    if !date_is_newer(&parsed.generated_at, &baked.generated_at) {
        return None;
    }
    Some(parsed)
}

/// Fetch the signed lock + signature, verify, and cache it when valid + newer
/// than `baked`. Best-effort: any network/host/verify failure returns Ok(false)
/// (or Err only on a local write failure), leaving the baked lock in force. A
/// newly-cached lock takes effect on the next launch (component_lock resolves
/// the override at startup) — never a hot swap mid-run.
pub fn refresh(baked: &RuntimeComponents, data_dir: &Path) -> AppResult<bool> {
    let client = reqwest::blocking::Client::new();
    let get = |url: String| {
        client
            .get(url)
            .header("User-Agent", "exasol-studio")
            .timeout(std::time::Duration::from_secs(20))
            .send()
            .ok()
            .and_then(|r| r.error_for_status().ok())
    };
    let Some(lock_resp) = get(VERIFIED_LOCK_URL.to_string()) else {
        return Ok(false);
    };
    let Ok(lock_bytes) = lock_resp.bytes() else {
        return Ok(false);
    };
    let Some(sig_resp) = get(format!("{VERIFIED_LOCK_URL}.sig")) else {
        return Ok(false);
    };
    let Ok(sig_text) = sig_resp.text() else {
        return Ok(false);
    };
    let Ok(sig_bytes) = base64::engine::general_purpose::STANDARD.decode(sig_text.trim()) else {
        return Ok(false);
    };
    if !verify_lock(&lock_bytes, &sig_bytes) {
        return Ok(false);
    }
    let Ok(parsed) = serde_json::from_slice::<RuntimeComponents>(&lock_bytes) else {
        return Ok(false);
    };
    // Must beat the monotonic floor (baked OR the highest already cached) — not
    // merely the baked lock — so an older validly-signed lock can't be replayed
    // over a newer one.
    if parsed.schema_version != baked.schema_version
        || !date_is_newer(&parsed.generated_at, &freshness_floor(baked, data_dir))
    {
        return Ok(false);
    }
    std::fs::create_dir_all(cache_dir(data_dir))?;
    std::fs::write(cached_lock(data_dir), &lock_bytes)?;
    std::fs::write(cached_sig(data_dir), &sig_bytes)?;
    Ok(true)
}

/// Background watcher: a while after launch, then periodically, fetch the signed
/// verified lock and cache it when it's newer than what's in force. A newly
/// cached lock is applied on the NEXT launch (component_lock resolves it at
/// startup) — never hot-swapped mid-run. Inert until a real public key is set.
pub fn start(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || {
        // No configured key ⇒ nothing to fetch; don't poll a URL pointlessly.
        if embedded_pubkey().is_none() {
            return;
        }
        let data_dir = app.state::<crate::state::AppState>().data_dir.clone();
        std::thread::sleep(std::time::Duration::from_secs(90));
        loop {
            let _ = refresh(crate::component_lock::components(), &data_dir);
            std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use rand::rngs::OsRng;

    #[test]
    fn verify_accepts_a_correct_signature_and_rejects_tampering() {
        let signing = SigningKey::generate(&mut OsRng);
        let vk = signing.verifying_key();
        let msg = br#"{"schema_version":1}"#;
        let sig = signing.sign(msg).to_bytes();

        assert!(verify_with(msg, &sig, &vk), "correct signature must verify");
        // Tampered payload.
        assert!(!verify_with(br#"{"schema_version":2}"#, &sig, &vk));
        // Tampered signature.
        let mut bad = sig;
        bad[0] ^= 0xFF;
        assert!(!verify_with(msg, &bad, &vk));
        // Wrong key.
        let other = SigningKey::generate(&mut OsRng).verifying_key();
        assert!(!verify_with(msg, &sig, &other));
        // Wrong signature length.
        assert!(!verify_with(msg, &sig[..63], &vk));
    }

    #[test]
    fn verify_lock_refuses_when_no_key_is_configured() {
        // The shipped placeholder key is empty → no fetched lock is ever trusted.
        assert!(embedded_pubkey().is_none());
        assert!(!verify_lock(b"anything", &[0u8; 64]));
    }

    #[test]
    fn decode_pubkey_validates_length_and_hex() {
        assert!(decode_pubkey("").is_none());
        assert!(decode_pubkey("zz").is_none());
        assert!(decode_pubkey(&"a".repeat(63)).is_none()); // wrong length
        // A real 32-byte key round-trips.
        let vk = SigningKey::generate(&mut OsRng).verifying_key();
        let hex: String = vk.to_bytes().iter().map(|b| format!("{b:02x}")).collect();
        assert!(decode_pubkey(&hex).is_some());
    }

    #[test]
    fn newer_of_picks_the_later_timestamp() {
        // The floor advances to the later of the two — anti-downgrade.
        assert_eq!(newer_of("2026-07-01T00:00:00Z".into(), "2026-08-01T00:00:00Z".into()), "2026-08-01T00:00:00Z");
        assert_eq!(newer_of("2026-08-01T00:00:00Z".into(), "2026-07-01T00:00:00Z".into()), "2026-08-01T00:00:00Z");
        // Unparseable candidate never lowers the floor.
        assert_eq!(newer_of("2026-08-01T00:00:00Z".into(), "nope".into()), "2026-08-01T00:00:00Z");
    }

    #[test]
    fn date_is_newer_compares_rfc3339() {
        assert!(date_is_newer("2026-08-01T00:00:00Z", "2026-07-31T23:59:59Z"));
        assert!(!date_is_newer("2026-07-31T00:00:00Z", "2026-07-31T00:00:00Z")); // equal
        assert!(!date_is_newer("2026-07-01T00:00:00Z", "2026-07-31T00:00:00Z")); // older
        assert!(!date_is_newer("not-a-date", "2026-07-31T00:00:00Z")); // unparseable → not newer
    }
}
