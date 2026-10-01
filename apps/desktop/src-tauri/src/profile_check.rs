//! The rules a connection profile must meet before it is saved: the address,
//! the sign-in, and the TLS trust settings. Pure, so every rule is tested.

use crate::error::{AppError, AppResult};
use crate::profiles::ConnectionProfile;

const SSL_MODES: &[&str] = &["preferred", "required", "verify_ca", "verify_identity"];
const AUTH_METHODS: &[&str] = &["password", "access_token", "refresh_token"];

/// Check and tidy a profile: split `host/FINGERPRINT`, normalize the pin,
/// retire "disabled" encryption, clear blank optional fields.
pub fn validate_profile(p: &mut ConnectionProfile) -> AppResult<()> {
    let bad = |m: &str| Err(AppError::InvalidSettings(m.to_string()));
    // host/FINGERPRINT, as Exasol's own clients write a pinned host.
    let host = p.host.trim().to_string();
    let (host, embedded) = match host.split_once('/') {
        Some((h, fp)) => (h.trim().to_string(), Some(fp.trim().to_string())),
        None => (host, None),
    };
    if host.is_empty() {
        return bad("Enter the host name or IP address of the database.");
    }
    p.host = host;
    if p.port == 0 {
        return bad("The port must be between 1 and 65535 (Exasol's default is 8563).");
    }
    if !AUTH_METHODS.contains(&p.auth_method.as_str()) {
        return bad("Choose how to sign in: password, access token, or refresh token.");
    }
    if p.auth_method == "password" && p.username.trim().is_empty() {
        return bad("Enter the user name to sign in with.");
    }
    let fp = embedded.or_else(|| p.fingerprint.clone()).filter(|f| !f.trim().is_empty());
    p.fingerprint = match fp {
        Some(f) => match crate::tls_trust::normalize_fingerprint(&f) {
            Some(n) => Some(n),
            None => return bad("The certificate fingerprint must be a SHA-256 fingerprint: 64 hexadecimal digits (colons allowed)."),
        },
        None => None,
    };
    // Exasol 8.19+ refuses unencrypted connections: "disabled" is gone.
    if p.ssl_mode == "disabled" || p.ssl_mode.is_empty() {
        p.ssl_mode = "required".into();
    }
    if !SSL_MODES.contains(&p.ssl_mode.as_str()) {
        return bad("Unknown encryption mode.");
    }
    if let Some(n) = &mut p.network {
        crate::network::validate(n)?;
        if n.ssh.is_none() && n.proxy.is_none() {
            p.network = None;
        }
    }
    p.ssl_ca = p.ssl_ca.as_deref().map(str::trim).filter(|c| !c.is_empty()).map(str::to_string);
    if let Some(ca) = &p.ssl_ca {
        if !std::path::Path::new(ca).is_absolute() {
            return bad("The CA certificate must be a full file path.");
        }
    }
    Ok(())
}

/// Whether a profile saved without an id is the same connection as `p` (so
/// it is updated, not added): the same name AND the same address and user.
/// Two connections to one server with different names are allowed — say a
/// read-only and an admin login.
pub fn same_connection(p: &ConnectionProfile, new: &ConnectionProfile) -> bool {
    p.name.trim().eq_ignore_ascii_case(new.name.trim())
        && p.host.trim().eq_ignore_ascii_case(new.host.trim())
        && p.port == new.port
        && p.username == new.username
        && p.driver_id == new.driver_id
}

/// Whether an edit that leaves the secret blank may keep the stored one: only
/// while it goes to the same server, as the same user, the same way. Anything
/// else could hand the old password to a different host — or send it as a
/// token.
pub fn may_reuse_secret(old: &ConnectionProfile, new: &ConnectionProfile) -> bool {
    old.host.trim().eq_ignore_ascii_case(new.host.trim())
        && old.port == new.port
        && old.username == new.username
        && old.auth_method == new.auth_method
}

/// A name for a copy that no other profile has: "X (copy)", "X (copy 2)", …
pub fn copy_name(name: &str, taken: &[String]) -> String {
    let base = format!("{} (copy)", name.trim());
    let free = |n: &str| !taken.iter().any(|t| t.trim().eq_ignore_ascii_case(n));
    if free(&base) {
        return base;
    }
    (2..).map(|i| format!("{} (copy {i})", name.trim())).find(|n| free(n)).expect("an unused name")
}

#[cfg(test)]
mod tests {
    use super::{copy_name, may_reuse_secret, same_connection, validate_profile};
    use crate::profiles::ConnectionProfile;

    fn draft() -> ConnectionProfile {
        ConnectionProfile {
            id: String::new(),
            name: "x".into(),
            host: "db.example.com".into(),
            port: 8563,
            username: "sys".into(),
            password: String::new(),
            schema: None,
            notes: None,
            ssl_mode: "verify_identity".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
            network: None,
        }
    }

    #[test]
    fn a_second_login_to_the_same_server_is_its_own_connection() {
        let a = draft();
        let mut b = draft();
        assert!(same_connection(&a, &b), "the same connection saved again");
        b.name = "x (admin)".into();
        assert!(!same_connection(&a, &b), "a different name is a different connection");
        let mut c = draft();
        c.port = 8564;
        assert!(!same_connection(&a, &c));
        let mut d = draft();
        d.host = "DB.EXAMPLE.COM".into();
        d.name = "X".into();
        assert!(same_connection(&a, &d), "host and name ignore case");
    }

    #[test]
    fn a_stored_secret_never_follows_a_changed_server_user_or_sign_in() {
        let old = draft();
        let mut same = draft();
        same.name = "renamed".into();
        same.notes = Some("new notes".into());
        assert!(may_reuse_secret(&old, &same), "renaming keeps it");
        for change in [
            |p: &mut ConnectionProfile| p.host = "other.example.com".into(),
            |p: &mut ConnectionProfile| p.port = 8564,
            |p: &mut ConnectionProfile| p.username = "admin".into(),
            |p: &mut ConnectionProfile| p.auth_method = "access_token".into(),
        ] {
            let mut p = draft();
            change(&mut p);
            assert!(!may_reuse_secret(&old, &p));
        }
    }

    #[test]
    fn a_copy_gets_a_free_name() {
        assert_eq!(copy_name("Prod", &["Prod".into()]), "Prod (copy)");
        assert_eq!(copy_name("Prod", &["Prod".into(), "Prod (copy)".into()]), "Prod (copy 2)");
        assert_eq!(copy_name("Prod", &["prod (COPY)".into(), "Prod (copy 2)".into()]), "Prod (copy 3)");
    }

    #[test]
    fn a_pinned_host_is_split_and_the_pin_normalized() {
        let mut p = draft();
        p.host = format!(" db.example.com/{} ", "ab".repeat(32));
        validate_profile(&mut p).unwrap();
        assert_eq!(p.host, "db.example.com");
        assert_eq!(p.fingerprint.as_deref(), Some("AB".repeat(32).as_str()));
        let mut p = draft();
        p.fingerprint = Some("1234".into());
        assert!(validate_profile(&mut p).unwrap_err().to_string().contains("SHA-256"));
    }

    #[test]
    fn unencrypted_is_retired_and_unknown_modes_refused() {
        let mut p = draft();
        p.ssl_mode = "disabled".into();
        validate_profile(&mut p).unwrap();
        assert_eq!(p.ssl_mode, "required");
        let mut p = draft();
        p.ssl_mode = "insecure".into();
        assert!(validate_profile(&mut p).is_err());
    }

    #[test]
    fn the_address_and_sign_in_must_be_complete() {
        let mut p = draft();
        p.port = 0;
        assert!(validate_profile(&mut p).unwrap_err().to_string().contains("between 1 and 65535"));
        let mut p = draft();
        p.host = "/".into();
        assert!(validate_profile(&mut p).is_err());
        let mut p = draft();
        p.username = String::new();
        assert!(validate_profile(&mut p).is_err(), "a password sign-in needs a user");
        p.auth_method = "access_token".into();
        validate_profile(&mut p).unwrap();
        p.auth_method = "kerberos".into();
        assert!(validate_profile(&mut p).is_err());
    }

    #[test]
    fn blank_optional_fields_are_cleared_and_the_ca_must_be_a_full_path() {
        let mut p = draft();
        p.fingerprint = Some("  ".into());
        p.ssl_ca = Some("  ".into());
        validate_profile(&mut p).unwrap();
        assert_eq!((p.fingerprint, p.ssl_ca), (None, None));
        let mut p = draft();
        p.ssl_ca = Some("certs/ca.pem".into());
        assert!(validate_profile(&mut p).unwrap_err().to_string().contains("full file path"));
    }
}
