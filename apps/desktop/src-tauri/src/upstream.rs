//! Upstream (official GitHub release) component updates.
//!
//! The verified lock stays the known-good baseline, but components must not be
//! COUPLED to Studio releases: when an official release is newer than the
//! verified pin, the Marketplace offers it directly. Verify-or-refuse still
//! holds — the hash comes from the digest GitHub publishes per release asset,
//! and an asset without a digest is refused, never installed unverified.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

use crate::component_lock::Artifact;
use crate::error::{AppError, AppResult};

pub struct UpstreamAsset {
    pub name: String,
    pub url: String,
    /// GitHub's per-asset digest, e.g. "sha256:<64 hex>". None on old releases.
    pub digest: Option<String>,
}

pub struct UpstreamRelease {
    pub tag: String,
    pub assets: Vec<UpstreamAsset>,
}

fn fetch_release(repo: &str, release_path: &str) -> Option<UpstreamRelease> {
    let response = reqwest::blocking::Client::new()
        .get(format!("https://api.github.com/repos/{repo}/releases/{release_path}"))
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let body: Value = response.json().ok()?;
    let tag = body.get("tag_name")?.as_str()?.to_string();
    let assets = body
        .get("assets")?
        .as_array()?
        .iter()
        .filter_map(|a| {
            Some(UpstreamAsset {
                name: a.get("name")?.as_str()?.to_string(),
                url: a.get("browser_download_url")?.as_str()?.to_string(),
                digest: a.get("digest").and_then(Value::as_str).map(str::to_string),
            })
        })
        .collect();
    Some(UpstreamRelease { tag, assets })
}

pub fn latest(repo: &str) -> Option<UpstreamRelease> {
    fetch_release(repo, "latest")
}

pub fn by_tag(repo: &str, tag: &str) -> Option<UpstreamRelease> {
    fetch_release(repo, &format!("tags/{tag}"))
}

fn common_suffix_len(a: &str, b: &str) -> usize {
    a.bytes().rev().zip(b.bytes().rev()).take_while(|(x, y)| x == y).count()
}

/// The release asset that corresponds to the verified lock's artifact for this
/// platform: names embed a version but end in a stable platform suffix
/// ("…-macos-aarch64", "…_macOS_arm64.tar.gz"), so the longest common suffix
/// with the lock's artifact name identifies the right asset. The suffix must
/// be at least 12 chars — a bare architecture tail like "-aarch64" (8) is
/// shared across OSes ("…-linux-aarch64" vs "…-macos-aarch64") and would pick
/// a wrong-OS binary when the right one is missing; digest verification can't
/// catch that. Ties are ambiguity — None, not a guess.
const MIN_ASSET_SUFFIX: usize = 12;

pub fn pick_asset<'a>(lock_name: &str, assets: &'a [UpstreamAsset]) -> Option<&'a UpstreamAsset> {
    let mut scored: Vec<(usize, &UpstreamAsset)> = assets
        .iter()
        .map(|a| (common_suffix_len(lock_name, &a.name), a))
        .filter(|(len, _)| *len >= MIN_ASSET_SUFFIX)
        .collect();
    scored.sort_by_key(|(len, _)| std::cmp::Reverse(*len));
    match scored.as_slice() {
        [] => None,
        [(best, asset), rest @ ..] => {
            if rest.first().is_some_and(|(second, _)| second == best) {
                return None; // two equally-good candidates — ambiguous
            }
            let _ = best;
            Some(asset)
        }
    }
}

/// A hash-verified Artifact from a release asset — or None when GitHub
/// published no usable sha256 digest for it (verify-or-refuse).
pub fn artifact_from(asset: &UpstreamAsset) -> Option<Artifact> {
    let sha = asset.digest.as_deref()?.strip_prefix("sha256:")?.to_ascii_lowercase();
    if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some(Artifact {
        name: asset.name.clone(),
        url: asset.url.clone(),
        sha256: sha,
        executable_sha256: None,
    })
}

/// Resolve the digest-verified artifact for `repo`@`tag` matching the verified
/// lock's platform artifact `lock_name`. Clear refusals, never a blind install.
pub fn resolve_artifact(repo: &str, tag: &str, lock_name: &str) -> AppResult<Artifact> {
    let release = by_tag(repo, tag)
        .ok_or_else(|| AppError::Storage(format!("Could not fetch release {tag} from github.com/{repo}.")))?;
    let asset = pick_asset(lock_name, &release.assets).ok_or_else(|| {
        AppError::Storage(format!("Release {tag} has no asset matching this platform ({lock_name})."))
    })?;
    artifact_from(asset).ok_or_else(|| {
        AppError::Storage(format!(
            "Release asset {} has no sha256 digest to verify against — refusing an unverified install.",
            asset.name
        ))
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamInfo {
    pub id: String,
    pub tag: String,
}

/// Latest official release tag per managed component (best-effort — a repo
/// that can't be reached is simply omitted). The Marketplace calls this after
/// rendering so a slow network never blocks the Updates panel.
#[tauri::command]
pub async fn components_upstream() -> AppResult<Vec<UpstreamInfo>> {
    tauri::async_runtime::spawn_blocking(|| {
        let lock = crate::component_lock::components();
        let watched: [(&str, String); 3] = [
            ("personal", lock.personal.repository.clone()),
            ("exapump", lock.exapump.repository.clone()),
            ("mcp-server", "exasol/mcp-server".to_string()),
        ];
        watched
            .into_iter()
            .filter_map(|(id, repo)| latest(&repo).map(|r| UpstreamInfo { id: id.into(), tag: r.tag }))
            .collect()
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str, digest: Option<&str>) -> UpstreamAsset {
        UpstreamAsset {
            name: name.into(),
            url: format!("https://example.com/{name}"),
            digest: digest.map(str::to_string),
        }
    }

    #[test]
    fn pick_asset_matches_the_platform_by_stable_suffix() {
        // exapump: version embedded mid-name, platform suffix stable.
        let assets = vec![
            asset("exapump-0.12.0-linux-aarch64", None),
            asset("exapump-0.12.0-macos-aarch64", None),
            asset("exapump-0.12.0-macos-x86_64", None),
            asset("third-party-licenses.txt", None),
        ];
        let picked = pick_asset("exapump-0.11.2-macos-aarch64", &assets).unwrap();
        assert_eq!(picked.name, "exapump-0.12.0-macos-aarch64");

        // exasol-personal: version-free names — exact match wins outright.
        let assets = vec![
            asset("exasol-personal_Linux_arm64.tar.gz", None),
            asset("exasol-personal_macOS_arm64.tar.gz", None),
            asset("exasol-personal_2.2.0_checksums.txt", None),
        ];
        let picked = pick_asset("exasol-personal_macOS_arm64.tar.gz", &assets).unwrap();
        assert_eq!(picked.name, "exasol-personal_macOS_arm64.tar.gz");
    }

    #[test]
    fn pick_asset_refuses_when_no_suffix_is_meaningful() {
        // Only a shared ".txt"/".gz" tail — too weak to identify a platform.
        let assets = vec![asset("notes.txt", None), asset("data.gz", None)];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &[]).is_none());
    }

    #[test]
    fn pick_asset_never_falls_back_to_another_os() {
        // The right platform asset is MISSING: "-aarch64" alone (8 chars)
        // must not match the linux build for a macos lock name.
        let assets = vec![
            asset("exapump-0.12.0-linux-aarch64", None),
            asset("exapump-0.12.0-windows-x86_64.exe", None),
        ];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
    }

    #[test]
    fn pick_asset_refuses_ambiguous_ties() {
        let assets = vec![
            asset("a-macos-aarch64", None),
            asset("b-macos-aarch64", None),
        ];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
    }

    #[test]
    fn artifact_from_requires_a_real_sha256_digest() {
        let sha = "a".repeat(64);
        let good = asset("exapump-0.12.0-macos-aarch64", Some(&format!("sha256:{sha}")));
        let art = artifact_from(&good).unwrap();
        assert_eq!(art.sha256, sha);
        assert!(art.executable_sha256.is_none());

        // Missing, wrong-algorithm, truncated, and non-hex digests all refuse.
        assert!(artifact_from(&asset("x", None)).is_none());
        assert!(artifact_from(&asset("x", Some("md5:abcd"))).is_none());
        assert!(artifact_from(&asset("x", Some("sha256:abcd"))).is_none());
        let bad_hex = format!("sha256:{}", "z".repeat(64));
        assert!(artifact_from(&asset("x", Some(&bad_hex))).is_none());
    }

    #[test]
    fn artifact_from_normalizes_digest_case() {
        let upper = format!("sha256:{}", "AB".repeat(32));
        let art = artifact_from(&asset("x", Some(&upper))).unwrap();
        assert_eq!(art.sha256, "ab".repeat(32));
    }
}
