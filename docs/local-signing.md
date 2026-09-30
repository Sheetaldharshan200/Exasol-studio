# One stable code identity for local macOS builds

Every local build is ad-hoc signed unless told otherwise. An ad-hoc signature
is derived from the binary, so each build is a different app to macOS: a new
`exasol-studio` row appears under **System Settings → Privacy & Security →
Local Network**, the permission is asked for again, and until it is granted
Studio's local database VM is unreachable ("no route to host") and setup
stalls.

Signing every build with one self-signed certificate keeps the identity
stable (bundle id `com.exasol.studio` + the same certificate), so macOS keeps
one entry and one decision. `scripts/build-local.sh` uses the certificate
automatically once it is in the login keychain.

## Create the certificate (once per Mac)

Keychain Access → **Certificate Assistant → Create a Certificate…**

- Name: `Exasol Studio Local Signing`
- Identity Type: Self-Signed Root
- Certificate Type: **Code Signing**

Or from a terminal:

```bash
cd "$(mktemp -d)"
cat > cert.cnf <<'CNF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Exasol Studio Local Signing
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 3650 -config cert.cnf
openssl pkcs12 -export -legacy -out id.p12 -inkey key.pem -in cert.pem -passout pass:local
security import id.p12 -k ~/Library/Keychains/login.keychain-db -P local -T /usr/bin/codesign
rm key.pem id.p12
security find-identity -p codesigning   # lists "Exasol Studio Local Signing"
```

The first signing may ask to allow `codesign` to use the key: choose
**Always Allow**.

## Releases

Production builds need a Developer ID instead (the `APPLE_*` secrets in
`.github/workflows/README.md`): that identity is stable across releases, so
users are asked for Local Network access once, ever.

## Old entries

The Local Network list is stored by macOS in a root-owned file with no remove
button. Stale rows from earlier ad-hoc builds are harmless; only the entry of
the build that is running matters.
