//! TLS trust for database connections: certificate fingerprint pinning and
//! trust-on-first-use. The driver verifies a CA chain (verify_ca /
//! verify_identity) but cannot pin a fingerprint, so a pinned profile's
//! server certificate is read and compared here before every connect, and
//! the connection then runs encrypted without the CA check the pin replaces.

use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::net::TcpStream;

/// A certificate verifier that accepts what it is shown. Used to READ a
/// server's certificate (its fingerprint is then compared or shown), and by
/// Panorama's shell for a database the person saved. Never on its own as
/// "trust".
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
        Ok(fingerprint_of(leaf.as_ref()))
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

/// The first host of an Exasol host range (`db1..4.example.com` → `db1.example.com`):
/// the nodes of a cluster present the same certificate.
pub fn first_host(host: &str) -> String {
    let b = host.as_bytes();
    if let Some(i) = host.find("..") {
        let digit_before = i > 0 && b[i - 1].is_ascii_digit();
        let end = host[i + 2..].find(|c: char| !c.is_ascii_digit()).map_or(host.len(), |n| i + 2 + n);
        if digit_before && end > i + 2 {
            return format!("{}{}", &host[..i], &host[end..]);
        }
    }
    host.to_string()
}

/// Check a pinned certificate before connecting: Ok when nothing is pinned
/// or the server presents exactly the pinned one.
pub async fn check_pin(host: &str, port: u16, pin: Option<&str>, timeout: Duration) -> crate::error::AppResult<()> {
    let Some(expected) = pin else { return Ok(()) };
    let actual = server_fingerprint(&first_host(host), port, timeout).await.map_err(crate::error::AppError::Database)?;
    if actual == expected {
        Ok(())
    } else {
        Err(crate::error::AppError::CertificateChanged { expected: expected.to_string(), actual })
    }
}

/// (encrypt, verify the CA chain) for drivers that take two switches. Always
/// encrypted; a pin replaces the CA check.
pub fn driver_tls(ssl_mode: &str, pinned: bool) -> (bool, bool) {
    (true, !pinned && matches!(ssl_mode, "verify_ca" | "verify_identity"))
}

/// Why a non-native driver cannot run this profile, if it cannot: a custom
/// CA file and token sign-in reach only the native driver.
pub fn bridge_unsupported(ssl_ca: Option<&str>, auth_method: &str) -> Option<String> {
    if auth_method != "password" {
        return Some("Token sign-in works with the native Exasol driver. Switch this connection's driver to Native, or sign in with a password.".into());
    }
    if ssl_ca.is_some() {
        return Some("A custom CA file works with the native Exasol driver. Pin the server's certificate instead, or switch the driver to Native.".into());
    }
    None
}

/// The encryption mode the driver gets. A pinned certificate replaces the CA
/// check (the pin is checked separately); "disabled" is no longer offered —
/// Exasol 8.19+ refuses unencrypted connections — and is read as "required".
pub fn effective_ssl_mode<'a>(ssl_mode: &'a str, pinned: bool) -> &'a str {
    if pinned {
        return "required";
    }
    match ssl_mode {
        "disabled" | "" => "required",
        other => other,
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
        assert_eq!(driver_tls("verify_identity", false), (true, true));
        assert_eq!(driver_tls("verify_identity", true), (true, false), "pinned: no CA check");
        assert_eq!(driver_tls("disabled", false), (true, false));
        assert!(bridge_unsupported(None, "password").is_none());
        assert!(bridge_unsupported(Some("/ca.pem"), "password").unwrap().contains("CA file"));
        assert!(bridge_unsupported(None, "access_token").unwrap().contains("Token"));
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
        assert_eq!(effective_ssl_mode("verify_identity", true), "required", "the pin replaces the CA check");
        assert_eq!(effective_ssl_mode("disabled", false), "required");
        assert_eq!(effective_ssl_mode("", false), "required");
        assert_eq!(effective_ssl_mode("verify_ca", false), "verify_ca");
        assert_eq!(effective_ssl_mode("preferred", false), "preferred");
    }
}
