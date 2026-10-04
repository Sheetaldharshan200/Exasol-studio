//! How a connection's password is kept at rest.
//!
//! - With the vault key: encrypted into `connections.json` (`v1:…`).
//! - Without it: in the OS keychain under a Studio-owned account, and the file
//!   holds only the marker `keychain:`. Never plaintext in a file.
//! - When neither is possible the password is not saved; the next connect asks.
//!
//! Older files may still hold plaintext. Reading reports it so the caller can
//! move it to the vault or the keychain on first use.

use crate::error::AppResult;
use crate::security;

/// The value written to the file when the password is in the keychain.
pub const KEYCHAIN_MARKER: &str = "keychain:";

/// The keychain account for a profile. Distinct from the shared `exa` CLI ids
/// (`host_port_user`), so Studio's own copy never collides with the CLI's.
pub fn keychain_account(profile_id: &str) -> String {
    format!("studio-{profile_id}")
}

/// What to write into the file for a password.
pub fn to_store(dek: Option<&[u8; 32]>, profile_id: &str, plaintext: &str, keychain_write: impl Fn(&str, &str) -> bool) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    if dek.is_some() {
        let sealed = security::encrypt_secret(dek, plaintext);
        // encrypt_secret falls back to plaintext on a sealing error; never keep that.
        if sealed != plaintext {
            return sealed;
        }
    }
    if keychain_write(&keychain_account(profile_id), plaintext) {
        KEYCHAIN_MARKER.to_string()
    } else {
        String::new()
    }
}

/// The password from what the file holds, and whether that was legacy
/// plaintext that should be moved.
pub fn from_store(dek: Option<&[u8; 32]>, profile_id: &str, stored: &str, keychain_read: impl Fn(&str) -> Option<String>) -> AppResult<(String, bool)> {
    if stored.is_empty() {
        return Ok((String::new(), false));
    }
    if stored == KEYCHAIN_MARKER {
        return Ok((keychain_read(&keychain_account(profile_id)).unwrap_or_default(), false));
    }
    if is_sealed(stored) {
        return Ok((security::decrypt_secret(dek, stored)?, false));
    }
    Ok((stored.to_string(), true))
}

fn is_sealed(stored: &str) -> bool {
    stored.starts_with("v1:")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    fn fake_keychain() -> RefCell<HashMap<String, String>> {
        RefCell::new(HashMap::new())
    }

    #[test]
    fn without_a_vault_key_the_file_never_holds_the_password() {
        let kc = fake_keychain();
        let stored = to_store(None, "conn-1", "s3cr3t", |a, p| {
            kc.borrow_mut().insert(a.into(), p.into());
            true
        });
        assert_eq!(stored, KEYCHAIN_MARKER);
        assert!(!stored.contains("s3cr3t"));
        assert_eq!(kc.borrow().get("studio-conn-1").map(String::as_str), Some("s3cr3t"));
        let (back, legacy) = from_store(None, "conn-1", &stored, |a| kc.borrow().get(a).cloned()).unwrap();
        assert_eq!((back.as_str(), legacy), ("s3cr3t", false));
    }

    #[test]
    fn no_vault_and_no_keychain_means_not_saved_rather_than_plaintext() {
        assert_eq!(to_store(None, "conn-1", "s3cr3t", |_, _| false), "");
    }

    #[test]
    fn with_a_vault_key_the_password_is_sealed_in_the_file_and_the_keychain_is_untouched() {
        let key = [7u8; 32];
        let touched = RefCell::new(false);
        let stored = to_store(Some(&key), "conn-1", "s3cr3t", |_, _| {
            *touched.borrow_mut() = true;
            true
        });
        assert!(stored.starts_with("v1:"));
        assert!(!*touched.borrow());
        let (back, legacy) = from_store(Some(&key), "conn-1", &stored, |_| None).unwrap();
        assert_eq!((back.as_str(), legacy), ("s3cr3t", false));
    }

    #[test]
    fn legacy_plaintext_reads_and_is_flagged_for_moving() {
        let (back, legacy) = from_store(None, "conn-1", "old-plain", |_| None).unwrap();
        assert_eq!((back.as_str(), legacy), ("old-plain", true));
        assert_eq!(from_store(None, "conn-1", "", |_| None).unwrap(), (String::new(), false));
        let (gone, _) = from_store(None, "conn-1", KEYCHAIN_MARKER, |_| None).unwrap();
        assert_eq!(gone, "", "a keychain entry that disappeared reads as no password");
        assert!(from_store(None, "conn-1", "v1:abc", |_| None).is_err(), "a sealed value needs the vault");
    }

    #[test]
    fn studio_accounts_never_collide_with_cli_ids() {
        assert_eq!(keychain_account("conn-1"), "studio-conn-1");
        assert_ne!(keychain_account("127.0.0.1_8563_sys"), "127.0.0.1_8563_sys");
    }
}
