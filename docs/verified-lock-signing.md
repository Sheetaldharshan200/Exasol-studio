# Verified lock — signing & over-the-air delivery (ops runbook)

Studio can update the pinned runtime component set on **already-installed** apps
without shipping a new app release, by fetching a **signed** copy of the
validated `runtime-components.lock.json` and accepting it only if its detached
ed25519 signature verifies against a public key **baked into the app**.

Everything is built and **inert by default**: no key is committed, so nothing
fetched is ever trusted until you complete the steps below.

## How it fits together
- `.github/workflows/refresh-runtime-components.yml` — resolves upstream, runs
  the 5-platform compatibility matrix, and (on human PR merge) lands a new
  `apps/desktop/src-tauri/resources/runtime-components.lock.json` on `main`.
- `.github/workflows/publish-verified-lock.yml` — on that change, signs the lock
  and force-publishes `runtime-components.lock.json` + `.sig` to the
  **`verified-lock`** branch. **Runs only when the signing secret is set.**
- App (`apps/desktop/src-tauri/src/verified_lock.rs`) — fetches
  `VERIFIED_LOCK_URL` + `.sig`, verifies against `VERIFIED_LOCK_PUBKEY_HEX`,
  accepts only when **valid + newer + same schema** (anti-downgrade), caches it,
  and prefers it over the baked lock on next launch.

The `.sig` is STANDARD base64 of the 64-byte ed25519 signature over the exact
lock bytes; the public key is 32 bytes as 64 hex chars.

## One-time setup

1. **Generate a keypair** (32-byte ed25519 seed). The private seed is written to
   a mode-600 file and **never printed** — only the public key is shown:
   ```bash
   umask 077   # so the seed file is created private
   python3 - <<'PY'
   from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
   from cryptography.hazmat.primitives import serialization
   k = Ed25519PrivateKey.generate()
   seed = k.private_bytes(serialization.Encoding.Raw,
                          serialization.PrivateFormat.Raw,
                          serialization.NoEncryption())
   pub = k.public_key().public_bytes(serialization.Encoding.Raw,
                                      serialization.PublicFormat.Raw)
   open("verified-lock.seed", "w").write(seed.hex())   # secret — do not commit
   print("PUBLIC KEY (bake into the app):", pub.hex())
   PY
   ```
   The seed is now in `./verified-lock.seed` (never echoed to the terminal/logs).

2. **Set the secret straight from that file** (so the seed never hits your shell
   history or stdout), then destroy the file:
   ```bash
   gh secret set VERIFIED_LOCK_SIGNING_KEY_HEX < verified-lock.seed
   rm -P verified-lock.seed   # or: shred -u verified-lock.seed
   ```
   (Or paste it via `Settings → Secrets and variables → Actions → New repository
   secret`, name `VERIFIED_LOCK_SIGNING_KEY_HEX`, then delete the file.)
   Never commit the seed; store a backup only in your secrets manager.

3. **Bake the public key into the app.** In
   `apps/desktop/src-tauri/src/verified_lock.rs` set:
   ```rust
   const VERIFIED_LOCK_PUBKEY_HEX: &str = "<the 64-hex-char PUBLIC key>";
   ```
   Confirm `VERIFIED_LOCK_URL` points at the `verified-lock` branch raw URL
   (default already does). Cut a normal app release so users get the embedded
   key. Until an app carries the key, it ignores the published lock (fail-safe).

4. **Publish.** Run the `Publish verified lock (signed)` workflow (or merge a
   lock refresh). It force-pushes the signed lock to the `verified-lock` branch;
   the workflow log prints the derived public key — confirm it matches step 3.

## Rotating the key
Generate a new pair, update the secret + `VERIFIED_LOCK_PUBKEY_HEX`, ship an app
release, then re-publish. Old apps keep trusting the old key until they update —
which is why key rotation requires an app release.

## Safety properties (already enforced by the app)
- **Fail-closed**: empty/invalid key ⇒ nothing fetched is trusted.
- **Signature required**: unsigned/mis-signed/tampered ⇒ rejected.
- **Anti-downgrade**: an older (e.g. revoked) but validly-signed lock can't be
  replayed past the monotonic freshness floor.
- **Schema-guarded**: a schema mismatch is rejected, not mis-parsed.
