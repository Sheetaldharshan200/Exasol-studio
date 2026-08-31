#!/usr/bin/env python3
"""Sign the validated runtime-components lock for over-the-air delivery.

Produces a detached ed25519 signature that the desktop app's `verified_lock.rs`
accepts: `verify_strict(lock_bytes, sig)` against the embedded 32-byte public
key, where the published `.sig` is STANDARD base64 of the 64-byte signature.

The signing key is read from the env var VERIFIED_LOCK_SIGNING_KEY_HEX (a 32-byte
ed25519 seed, hex). If it is empty/unset this exits 0 WITHOUT writing anything —
so the pipeline stays inert until ops provisions the key (nothing is published
that the app would trust, because the app's embedded public key is also empty).

Usage: sign_verified_lock.py <lock_path> <out_dir>
Writes <out_dir>/runtime-components.lock.json (byte-identical copy) and
<out_dir>/runtime-components.lock.json.sig, and prints the derived public key
hex so ops can confirm it matches VERIFIED_LOCK_PUBKEY_HEX baked into the app.
"""
import base64
import os
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: sign_verified_lock.py <lock_path> <out_dir>", file=sys.stderr)
        return 2
    lock_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])

    key_hex = os.environ.get("VERIFIED_LOCK_SIGNING_KEY_HEX", "").strip()
    if not key_hex:
        # Inert: no key provisioned → publish nothing, and don't even require the
        # crypto dependency. Signals "skipped" to CI.
        print("VERIFIED_LOCK_SIGNING_KEY_HEX is empty — skipping (inert).")
        return 0

    # Imported only on the signing path so the inert skip has no dependencies.
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    try:
        seed = bytes.fromhex(key_hex)
    except ValueError:
        print("VERIFIED_LOCK_SIGNING_KEY_HEX is not valid hex.", file=sys.stderr)
        return 1
    if len(seed) != 32:
        print(f"signing key must be a 32-byte seed (64 hex chars); got {len(seed)} bytes.", file=sys.stderr)
        return 1

    key = Ed25519PrivateKey.from_private_bytes(seed)
    # Sign the EXACT on-disk bytes — the app verifies over the fetched bytes, so
    # the published lock must be byte-identical to what was signed.
    lock_bytes = lock_path.read_bytes()
    signature = key.sign(lock_bytes)  # 64 bytes, canonical (RFC 8032)
    assert len(signature) == 64

    pub_hex = key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    ).hex()

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "runtime-components.lock.json").write_bytes(lock_bytes)
    (out_dir / "runtime-components.lock.json.sig").write_text(
        base64.standard_b64encode(signature).decode("ascii") + "\n"
    )
    print(f"Signed {lock_path} ({len(lock_bytes)} bytes).")
    print(f"Public key (set VERIFIED_LOCK_PUBKEY_HEX to this): {pub_hex}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
