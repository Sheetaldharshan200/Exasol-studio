//! TLS trust for database connections: certificate pinning and trust on
//! first use. The driver cannot pin a fingerprint, so a pinned certificate is
//! kept as a file and given to the driver as its CA, in verify-identity mode:
//! the very connection that signs in must present a certificate signed by the
//! pinned one's key, for this host. (A separate "check, then connect without
//! verifying" would let a man in the middle pass the check and take the login.)

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

/// The first host of an Exasol host range (`db1..4.example.com` → `db1.example.com`):
/// the nodes of a cluster present the same certificate.
pub fn first_host(host: &str) -> String {
    let b = host.as_bytes();
    // The last "..", as the driver reads a range.
    if let Some(i) = host.rfind("..") {
        let digit_before = i > 0 && b[i - 1].is_ascii_digit();
        let end = host[i + 2..].find(|c: char| !c.is_ascii_digit()).map_or(host.len(), |n| i + 2 + n);
        if digit_before && end > i + 2 {
            return format!("{}{}", &host[..i], &host[end..]);
        }
    }
    host.to_string()
}

/// PEM for one DER certificate.
pub fn pem_of(der: &[u8]) -> String {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(der);
    let lines: Vec<&str> = b64.as_bytes().chunks(64).map(|c| std::str::from_utf8(c).unwrap_or_default()).collect();
    format!("-----BEGIN CERTIFICATE-----\n{}\n-----END CERTIFICATE-----\n", lines.join("\n"))
}

/// The fingerprint of the first certificate in a PEM file's text.
pub fn pem_fingerprint(pem: &str) -> Option<String> {
    use base64::Engine;
    let body: String = pem.lines().skip_while(|l| !l.starts_with("-----BEGIN CERTIFICATE")).skip(1).take_while(|l| !l.starts_with("-----END")).collect();
    let der = base64::engine::general_purpose::STANDARD.decode(body.trim()).ok().filter(|d| !d.is_empty())?;
    Some(fingerprint_of(&der))
}

/// The pinned certificate as a CA file the driver can use: kept under
/// `<data>/pins/<FINGERPRINT>.pem`. Written from the server's certificate the
/// first time, and only if it has exactly the pinned fingerprint; a different
/// certificate is reported as changed.
pub async fn pin_file(data_dir: &std::path::Path, host: &str, port: u16, pin: &str, timeout: Duration) -> crate::error::AppResult<std::path::PathBuf> {
    let path = data_dir.join("pins").join(format!("{pin}.pem"));
    if std::fs::read_to_string(&path).ok().and_then(|t| pem_fingerprint(&t)).as_deref() == Some(pin) {
        return Ok(path);
    }
    let der = server_certificate(&first_host(host), port, timeout).await.map_err(crate::error::AppError::Database)?;
    let actual = fingerprint_of(&der);
    if actual != pin {
        return Err(crate::error::AppError::CertificateChanged { expected: pin.to_string(), actual });
    }
    std::fs::create_dir_all(path.parent().expect("pins dir"))?;
    crate::storage::write_private(&path, pem_of(&der).as_bytes())?;
    Ok(path)
}

/// (encrypt, verify the CA chain) for drivers that take two switches. Always
/// encrypted.
pub fn driver_tls(ssl_mode: &str) -> (bool, bool) {
    (true, matches!(ssl_mode, "verify_ca" | "verify_identity"))
}

/// Why a non-native driver cannot run this profile, if it cannot: a pinned
/// certificate, a custom CA file and token sign-in are applied only by the
/// native driver, so the others refuse rather than connect less safely.
pub fn bridge_unsupported(ssl_ca: Option<&str>, auth_method: &str, pinned: bool) -> Option<String> {
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

/// The encryption mode the driver gets. A pinned certificate is checked as
/// the CA with the host name (`verify_identity`). "disabled" and "preferred"
/// (which falls back to plaintext when TLS fails — a downgrade a man in the
/// middle can force) are read as "required": always encrypted.
pub fn effective_ssl_mode(ssl_mode: &str, pinned: bool) -> &str {
    if pinned {
        return "verify_identity";
    }
    match ssl_mode {
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
        assert!(bridge_unsupported(None, "password", false).is_none());
        assert!(bridge_unsupported(Some("/ca.pem"), "password", false).unwrap().contains("CA file"));
        assert!(bridge_unsupported(None, "access_token", false).unwrap().contains("Token"));
        assert!(bridge_unsupported(None, "password", true).unwrap().contains("pinned"));
    }

    #[test]
    fn a_pinned_certificate_round_trips_through_its_pem_file() {
        let der: Vec<u8> = (0u8..=200).collect();
        let pem = pem_of(&der);
        assert!(pem.starts_with("-----BEGIN CERTIFICATE-----\n") && pem.ends_with("-----END CERTIFICATE-----\n"));
        assert!(pem.lines().all(|l| l.len() <= 64));
        assert_eq!(pem_fingerprint(&pem), Some(fingerprint_of(&der)));
        assert_eq!(pem_fingerprint("not a certificate"), None);
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
        assert_eq!(effective_ssl_mode("required", true), "verify_identity", "the pin is checked on the connection itself");
        assert_eq!(effective_ssl_mode("disabled", false), "required");
        assert_eq!(effective_ssl_mode("", false), "required");
        assert_eq!(effective_ssl_mode("preferred", false), "required", "no plaintext fallback");
        assert_eq!(effective_ssl_mode("verify_ca", false), "verify_ca");
    }
}
