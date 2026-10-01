//! TLS trust for database connections: certificate pinning and trust on
//! first use. The driver cannot pin a fingerprint, and its CA option only
//! ADDS to its built-in public roots, so a pinned connection does not use the
//! driver's TLS at all: it goes through a loopback tunnel (pin_tunnel.rs)
//! whose TLS to the server is verified by `PinVerifier` — the leaf
//! certificate must be exactly the pinned one, on every connection.

use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::net::TcpStream;

/// A certificate verifier that accepts what it is shown. Used to READ a
/// server's certificate (to show or pin it), and by Panorama's proxy for a
/// connection set to "encrypt without verifying" — or a pinned one, whose
/// fingerprint it then checks on that same connection.
#[derive(Debug)]
pub(crate) struct AcceptAny(pub(crate) rustls::crypto::CryptoProvider);

impl rustls::client::danger::ServerCertVerifier for AcceptAny {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}


/// A fingerprint as typed or pasted (colons, spaces, any case, an optional
/// "sha256:" prefix) in its stored form: 64 upper-case hex digits. None if it
/// is not a SHA-256 fingerprint.
pub fn normalize_fingerprint(input: &str) -> Option<String> {
    let s = input.trim();
    let s = s.strip_prefix("sha256:").or_else(|| s.strip_prefix("SHA256:")).unwrap_or(s);
    let hex: String = s.chars().filter(|c| !matches!(c, ':' | ' ' | '-')).collect::<String>().to_ascii_uppercase();
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit())).then_some(hex)
}

/// SHA-256 over the certificate's DER bytes, as stored.
pub fn fingerprint_of(der: &[u8]) -> String {
    Sha256::digest(der).iter().map(|b| format!("{b:02X}")).collect()
}

/// For people: groups of four, so two fingerprints can be compared by eye.
pub fn display_fingerprint(fp: &str) -> String {
    fp.as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join(" ")
}

/// The fingerprint of the certificate the server presents now.
pub async fn server_fingerprint(host: &str, port: u16, timeout: Duration) -> Result<String, String> {
    server_certificate(host, port, timeout).await.map(|der| fingerprint_of(&der))
}

/// The DER of the certificate the server presents now (read only — never a
/// trust decision by itself).
pub async fn server_certificate(host: &str, port: u16, timeout: Duration) -> Result<Vec<u8>, String> {
    let provider = rustls::crypto::ring::default_provider();
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(provider.clone()))
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAny(provider)))
        .with_no_client_auth();
    let host = host.trim();
    let name = rustls::pki_types::ServerName::try_from(host.to_string()).map_err(|_| format!("{host} is not a valid server name"))?;
    let handshake = async {
        let tcp = TcpStream::connect((host, port)).await.map_err(|e| format!("could not reach {host}:{port}: {e}"))?;
        let tls = tokio_rustls::TlsConnector::from(Arc::new(config))
            .connect(name, tcp)
            .await
            .map_err(|e| format!("TLS to {host}:{port} failed: {e}"))?;
        let (_, conn) = tls.get_ref();
        let leaf = conn.peer_certificates().and_then(|c| c.first()).ok_or_else(|| "the server sent no certificate".to_string())?;
        Ok(leaf.as_ref().to_vec())
    };
    tokio::time::timeout(timeout, handshake).await.map_err(|_| format!("{host}:{port} did not answer the TLS handshake in time"))?
}

/// Whether a connect error means the certificate could not be verified (the
/// moment to offer trusting it), not an unreachable server or a bad login.
pub fn is_untrusted_certificate(error: &str) -> bool {
    let e = error.to_ascii_lowercase();
    ["certificate couldn't be verified", "unknownissuer", "unknown issuer", "self signed", "self-signed", "invalidcertificate", "invalid peer certificate", "certificate verify failed", "notvalidforname", "not valid for name", "expired"]
        .iter()
        .any(|p| e.contains(p))
}

/// The first host of an Exasol host range (`db1..4.example.com` → `db1.example.com`).
pub fn first_host(host: &str) -> String {
    expand_hosts(host).swap_remove(0)
}

/// The nodes of an Exasol host range, as the driver reads it (the last ".."
/// between digits, ascending): `db1..3.x` → db1.x, db2.x, db3.x.
pub fn expand_hosts(host: &str) -> Vec<String> {
    if let Some(i) = host.rfind("..") {
        let before = &host[..i];
        let after = &host[i + 2..];
        let digits_before = before.len() - before.trim_end_matches(|c: char| c.is_ascii_digit()).len();
        let digits_after = after.len() - after.trim_start_matches(|c: char| c.is_ascii_digit()).len();
        if digits_before > 0 && digits_after > 0 {
            let prefix = &before[..before.len() - digits_before];
            let start_s = &before[before.len() - digits_before..];
            let suffix = &after[digits_after..];
            if let (Ok(start), Ok(end)) = (start_s.parse::<usize>(), after[..digits_after].parse::<usize>()) {
                if start < end && end - start < 64 {
                    let width = if start_s.len() > start.to_string().len() { start_s.len() } else { 0 };
                    return (start..=end).map(|n| format!("{prefix}{n:0width$}{suffix}")).collect();
                }
            }
        }
    }
    vec![host.to_string()]
}

/// Accepts exactly the pinned certificate: its SHA-256 must match, and the
/// handshake signature (checked by the provider) proves the server holds its
/// key. Anything else fails the handshake — nothing is relayed.
#[derive(Debug)]
pub(crate) struct PinVerifier {
    pin: String,
    provider: rustls::crypto::CryptoProvider,
}

impl rustls::client::danger::ServerCertVerifier for PinVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        if fingerprint_of(end_entity.as_ref()) == self.pin {
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General("the server's certificate is not the pinned one".into()))
        }
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// A TLS client that trusts only the pinned certificate.
pub(crate) fn pinned_client(pin: &str) -> Result<Arc<rustls::ClientConfig>, String> {
    let provider = rustls::crypto::ring::default_provider();
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(provider.clone()))
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinVerifier { pin: pin.to_string(), provider }))
        .with_no_client_auth();
    Ok(Arc::new(config))
}

/// For a clear message before connecting: Ok, or the certificate the server
/// presents instead. (Not the protection — that is `PinVerifier` on every
/// tunnelled connection.)
pub async fn check_pin(host: &str, port: u16, pin: &str, timeout: Duration) -> crate::error::AppResult<()> {
    // Any node of a range that presents the pin is enough (the tunnel fails
    // over the same way); otherwise the mismatch, else why none answered.
    let mut changed = None;
    let mut unreachable = String::new();
    for node in expand_hosts(host) {
        match server_fingerprint(&node, port, timeout).await {
            Ok(fp) if fp == pin => return Ok(()),
            Ok(fp) => changed = changed.or(Some(fp)),
            Err(e) => unreachable = e,
        }
    }
    match changed {
        Some(actual) => Err(crate::error::AppError::CertificateChanged { expected: pin.to_string(), actual }),
        None => Err(crate::error::AppError::Database(unreachable)),
    }
}

/// (encrypt, verify the CA chain) for drivers that take two switches. Always
/// encrypted.
pub fn driver_tls(ssl_mode: &str) -> (bool, bool) {
    (true, matches!(ssl_mode, "verify_ca" | "verify_identity"))
}

/// Why a non-native driver cannot run this profile, if it cannot: a pinned
/// certificate, a custom CA file and token sign-in are applied only by the
/// native driver, so the others refuse rather than connect less safely.
pub fn bridge_unsupported(ssl_ca: Option<&str>, auth_method: &str, pinned: bool, routed: bool) -> Option<String> {
    if routed {
        return Some("An SSH tunnel or proxy works with the native Exasol driver. Switch this connection's driver to Native.".into());
    }
    if auth_method != "password" {
        return Some("Token sign-in works with the native Exasol driver. Switch this connection's driver to Native, or sign in with a password.".into());
    }
    if pinned {
        return Some("A pinned certificate is verified by the native Exasol driver. Switch this connection's driver to Native, or remove the pin.".into());
    }
    if ssl_ca.is_some() {
        return Some("A custom CA file works with the native Exasol driver. Switch the driver to Native, or remove the CA file.".into());
    }
    None
}

/// The internal mode of a driver URL that points at a pin tunnel.
pub const LOOPBACK_TUNNEL: &str = "loopback-tunnel";

/// The encryption mode the driver gets. "disabled" and "preferred"
/// (which falls back to plaintext when TLS fails — a downgrade a man in the
/// middle can force) are read as "required": always encrypted.
pub fn effective_ssl_mode(ssl_mode: &str) -> &str {
    match ssl_mode {
        // Only a pinned connection's own loopback tunnel (pin_tunnel.rs),
        // which carries the TLS itself; never a saved mode.
        LOOPBACK_TUNNEL => "disabled",
        "verify_ca" => "verify_ca",
        "verify_identity" => "verify_identity",
        _ => "required",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprints_are_read_in_every_common_spelling() {
        let fp = "AB".repeat(32);
        assert_eq!(normalize_fingerprint(&fp), Some(fp.clone()));
        let colons = fp.as_bytes().chunks(2).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join(":").to_lowercase();
        assert_eq!(normalize_fingerprint(&colons), Some(fp.clone()));
        assert_eq!(normalize_fingerprint(&format!("sha256:{fp}")), Some(fp.clone()));
        assert_eq!(normalize_fingerprint(&format!("  {}  ", display_fingerprint(&fp))), Some(fp.clone()));
        assert_eq!(normalize_fingerprint("ABCD"), None, "too short");
        assert_eq!(normalize_fingerprint(&"G".repeat(64)), None, "not hex");
        assert_eq!(normalize_fingerprint(""), None);
    }

    #[test]
    fn the_fingerprint_is_sha256_of_the_der() {
        // SHA-256 of the empty input.
        assert_eq!(fingerprint_of(b""), "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855");
        assert_eq!(display_fingerprint("ABCDEFGH"), "ABCD EFGH");
    }

    #[test]
    fn certificate_errors_are_told_apart_from_other_failures() {
        assert!(is_untrusted_certificate("invalid peer certificate: UnknownIssuer"));
        assert!(is_untrusted_certificate("invalid peer certificate: NotValidForName"));
        assert!(is_untrusted_certificate("certificate verify failed: self signed certificate"));
        assert!(!is_untrusted_certificate("Connection refused (os error 61)"));
        assert!(!is_untrusted_certificate("[08004] Connection exception - authentication failed."));
    }

    #[test]
    fn other_drivers_always_encrypt_and_say_what_they_cannot_do() {
        assert_eq!(driver_tls("verify_identity"), (true, true));
        assert_eq!(driver_tls("disabled"), (true, false));
        assert!(bridge_unsupported(None, "password", false, false).is_none());
        assert!(bridge_unsupported(Some("/ca.pem"), "password", false, false).unwrap().contains("CA file"));
        assert!(bridge_unsupported(None, "access_token", false, false).unwrap().contains("Token"));
        assert!(bridge_unsupported(None, "password", true, false).unwrap().contains("pinned"));
        assert!(bridge_unsupported(None, "password", false, true).unwrap().contains("SSH"));
    }

    #[test]
    fn a_host_range_expands_to_its_nodes() {
        assert_eq!(expand_hosts("db1..3.example.com"), vec!["db1.example.com", "db2.example.com", "db3.example.com"]);
        assert_eq!(expand_hosts("n08..10"), vec!["n08", "n09", "n10"]);
        assert_eq!(expand_hosts("db.example.com"), vec!["db.example.com"]);
        assert_eq!(expand_hosts("db4..1"), vec!["db4..1"], "not ascending: as it is");
        assert_eq!(expand_hosts("::1"), vec!["::1"]);
    }

    #[test]
    fn a_host_range_is_checked_on_its_first_host() {
        assert_eq!(first_host("db1..4.example.com"), "db1.example.com");
        assert_eq!(first_host("10.0.0.11..14"), "10.0.0.11");
        assert_eq!(first_host("db.example.com"), "db.example.com");
        assert_eq!(first_host("a..b.example.com"), "a..b.example.com", "not a range");
    }

    #[test]
    fn a_pin_or_a_retired_mode_decides_what_the_driver_gets() {
        assert_eq!(effective_ssl_mode("disabled"), "required");
        assert_eq!(effective_ssl_mode(""), "required");
        assert_eq!(effective_ssl_mode("preferred"), "required", "no plaintext fallback");
        assert_eq!(effective_ssl_mode("verify_ca"), "verify_ca");
        assert_eq!(effective_ssl_mode(LOOPBACK_TUNNEL), "disabled", "the tunnel carries the TLS");
    }
}
