//! How a connection reaches its database when it cannot connect directly:
//! through an SSH tunnel (ssh_tunnel.rs) or an HTTP / SOCKS proxy
//! (proxy_tunnel.rs). Settings live on the profile; their secrets (an SSH
//! password or key passphrase, a proxy password) are sealed like the
//! database password — vault, else keychain — and never reach the page.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSettings {
    #[serde(default)]
    pub ssh: Option<SshSettings>,
    #[serde(default)]
    pub proxy: Option<ProxySettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SshSettings {
    /// A host name, or a Host alias from ~/.ssh/config.
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub user: Option<String>,
    /// agent | key | password
    #[serde(default = "default_ssh_auth")]
    pub auth: String,
    #[serde(default)]
    pub key_path: Option<String>,
    /// A jump host (`ssh -J`), e.g. `user@bastion:22`.
    #[serde(default)]
    pub jump: Option<String>,
    /// strict | accept_new | ask
    #[serde(default = "default_host_key")]
    pub host_key: String,
    /// Keep-alive interval in seconds (0 = off).
    #[serde(default = "default_keepalive")]
    pub keepalive_secs: u32,
    /// The password or key passphrase, sealed in the file; plain only in
    /// memory for a connect. Never sent to the page.
    #[serde(default)]
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    /// socks5 | http
    pub kind: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub user: Option<String>,
    /// Sealed like the database password.
    #[serde(default)]
    pub secret: String,
}

fn default_ssh_auth() -> String {
    "agent".into()
}
fn default_host_key() -> String {
    "ask".into()
}
fn default_keepalive() -> u32 {
    30
}

/// The keychain / vault account of a profile's network secrets.
pub fn secret_id(profile_id: &str, what: &str) -> String {
    format!("{profile_id}-{what}")
}

/// Check and tidy the network settings before a save.
pub fn validate(n: &mut NetworkSettings) -> AppResult<()> {
    let bad = |m: &str| Err(AppError::InvalidSettings(m.to_string()));
    if let Some(s) = &mut n.ssh {
        s.host = s.host.trim().to_string();
        if s.host.is_empty() {
            return bad("Enter the SSH server (a host name or an alias from ~/.ssh/config).");
        }
        if s.host.starts_with('-') || s.jump.as_deref().is_some_and(|j| j.trim().starts_with('-')) || s.user.as_deref().is_some_and(|u| u.starts_with('-')) {
            return bad("SSH host, user and jump host cannot start with a dash.");
        }
        if !["agent", "key", "password"].contains(&s.auth.as_str()) {
            return bad("Choose how to sign in to SSH: agent, key file, or password.");
        }
        if !["strict", "accept_new", "ask"].contains(&s.host_key.as_str()) {
            return bad("Choose how to check the SSH host key.");
        }
        s.key_path = s.key_path.as_deref().map(str::trim).filter(|k| !k.is_empty()).map(str::to_string);
        if s.auth == "key" && s.key_path.is_none() {
            return bad("Choose the SSH private key file.");
        }
        s.user = s.user.as_deref().map(str::trim).filter(|u| !u.is_empty()).map(str::to_string);
        s.jump = s.jump.as_deref().map(str::trim).filter(|j| !j.is_empty()).map(str::to_string);
        if s.port == Some(0) {
            return bad("The SSH port must be between 1 and 65535.");
        }
        s.keepalive_secs = s.keepalive_secs.min(3600);
    }
    if let Some(p) = &mut n.proxy {
        p.host = p.host.trim().to_string();
        if !["socks5", "http"].contains(&p.kind.as_str()) {
            return bad("Choose a SOCKS5 or HTTP proxy.");
        }
        if p.host.is_empty() || p.port == 0 {
            return bad("Enter the proxy's host and port.");
        }
        p.user = p.user.as_deref().map(str::trim).filter(|u| !u.is_empty()).map(str::to_string);
    }
    if n.ssh.is_some() && n.proxy.is_some() {
        return bad("Use an SSH tunnel or a proxy, not both (an SSH ProxyCommand in ~/.ssh/config can chain them).");
    }
    Ok(())
}

/// Whether a blank secret on edit may keep the stored one: same server and
/// user. Like the database password, it never follows a changed host.
pub fn may_keep_ssh_secret(old: &SshSettings, new: &SshSettings) -> bool {
    old.host == new.host && old.user == new.user && old.auth == new.auth && old.jump == new.jump
}

pub fn may_keep_proxy_secret(old: &ProxySettings, new: &ProxySettings) -> bool {
    old.host == new.host && old.port == new.port && old.user == new.user
}

/// Seal the typed secrets before a save; a blank one keeps the stored one
/// only for the same server (`previous`: the profile as saved before).
pub fn seal(dek: Option<&[u8; 32]>, profile_id: &str, n: &mut NetworkSettings, previous: Option<&NetworkSettings>) {
    let write = crate::shared_registry::write_credential;
    if let Some(s) = &mut n.ssh {
        s.secret = if !s.secret.is_empty() {
            crate::profile_secret::to_store(dek, &secret_id(profile_id, "ssh"), &s.secret, write)
        } else {
            previous.and_then(|p| p.ssh.as_ref()).filter(|old| may_keep_ssh_secret(old, s)).map(|old| old.secret.clone()).unwrap_or_default()
        };
    }
    if let Some(p) = &mut n.proxy {
        p.secret = if !p.secret.is_empty() {
            crate::profile_secret::to_store(dek, &secret_id(profile_id, "proxy"), &p.secret, write)
        } else {
            previous.and_then(|x| x.proxy.as_ref()).filter(|old| may_keep_proxy_secret(old, p)).map(|old| old.secret.clone()).unwrap_or_default()
        };
    }
}

/// The plain secrets for a connect (stored → usable).
pub fn open(dek: Option<&[u8; 32]>, profile_id: &str, n: &mut NetworkSettings) -> AppResult<()> {
    let read = crate::shared_registry::read_credential;
    if let Some(s) = &mut n.ssh {
        s.secret = crate::profile_secret::from_store(dek, &secret_id(profile_id, "ssh"), &s.secret, read)?.0;
    }
    if let Some(p) = &mut n.proxy {
        p.secret = crate::profile_secret::from_store(dek, &secret_id(profile_id, "proxy"), &p.secret, read)?.0;
    }
    Ok(())
}

/// What the page sees: the settings, never a secret.
pub fn redact(n: &mut NetworkSettings) {
    if let Some(s) = &mut n.ssh {
        s.secret.clear();
    }
    if let Some(p) = &mut n.proxy {
        p.secret.clear();
    }
}

/// Remove a deleted profile's network secrets from the keychain.
pub fn forget(profile_id: &str) {
    for what in ["ssh", "proxy"] {
        crate::shared_registry::delete_credential(&crate::profile_secret::keychain_account(&secret_id(profile_id, what)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssh() -> SshSettings {
        SshSettings {
            host: "bastion".into(),
            port: None,
            user: None,
            auth: "agent".into(),
            key_path: None,
            jump: None,
            host_key: "ask".into(),
            keepalive_secs: 30,
            secret: String::new(),
        }
    }

    #[test]
    fn ssh_settings_are_checked_and_tidied() {
        let mut n = NetworkSettings { ssh: Some(SshSettings { host: " bastion ".into(), user: Some("  ".into()), jump: Some(" ".into()), ..ssh() }), proxy: None };
        validate(&mut n).unwrap();
        let s = n.ssh.unwrap();
        assert_eq!((s.host.as_str(), s.user, s.jump), ("bastion", None, None));
        let mut n = NetworkSettings { ssh: Some(SshSettings { auth: "key".into(), ..ssh() }), proxy: None };
        assert!(validate(&mut n).unwrap_err().to_string().contains("private key"));
        let mut n = NetworkSettings { ssh: Some(SshSettings { host: "-oProxyCommand=evil".into(), ..ssh() }), proxy: None };
        assert!(validate(&mut n).unwrap_err().to_string().contains("dash"), "no option injection");
        let mut n = NetworkSettings { ssh: Some(SshSettings { jump: Some("-oX".into()), ..ssh() }), proxy: None };
        assert!(validate(&mut n).is_err());
        let mut n = NetworkSettings { ssh: Some(SshSettings { host_key: "never".into(), ..ssh() }), proxy: None };
        assert!(validate(&mut n).is_err());
    }

    #[test]
    fn proxy_settings_are_checked_and_one_route_at_a_time() {
        let proxy = ProxySettings { kind: "socks5".into(), host: "proxy".into(), port: 1080, user: None, secret: String::new() };
        let mut n = NetworkSettings { ssh: None, proxy: Some(proxy.clone()) };
        validate(&mut n).unwrap();
        let mut n = NetworkSettings { ssh: None, proxy: Some(ProxySettings { kind: "ftp".into(), ..proxy.clone() }) };
        assert!(validate(&mut n).is_err());
        let mut n = NetworkSettings { ssh: Some(ssh()), proxy: Some(proxy) };
        assert!(validate(&mut n).unwrap_err().to_string().contains("not both"));
    }

    #[test]
    fn a_stored_secret_never_follows_a_changed_server() {
        assert!(may_keep_ssh_secret(&ssh(), &ssh()));
        assert!(!may_keep_ssh_secret(&ssh(), &SshSettings { host: "other".into(), ..ssh() }));
        assert!(!may_keep_ssh_secret(&ssh(), &SshSettings { user: Some("root".into()), ..ssh() }));
        let p = ProxySettings { kind: "http".into(), host: "p".into(), port: 3128, user: None, secret: String::new() };
        assert!(may_keep_proxy_secret(&p, &p));
        assert!(!may_keep_proxy_secret(&p, &ProxySettings { port: 8080, ..p.clone() }));
    }
}
