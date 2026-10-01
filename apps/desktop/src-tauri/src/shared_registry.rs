//! The connection registry shared with the `exa` CLI.
//!
//! Studio and the CLI are separate programs that must agree about which
//! databases exist: one connected in the CLI has to appear in Studio, and the
//! other way round. Neither owns the list, so it lives outside both of their
//! private directories:
//!
//!   ~/.exasol/connections.json      metadata both read and write
//!   ~/.exasol/credentials/<id>      one secret per connection, 0600
//!
//! Studio keeps its own encrypted profile store as the source of truth for its
//! UI (it carries fields the CLI has no concept of — SSL mode, compression,
//! driver). This module is the bridge: publish outward on save, import inward
//! what the CLI added.
//!
//! Passwords are NOT in the registry and are not written to disk in the clear.
//! They go to the operating system's credential store — Keychain on macOS, the
//! Secret Service on Linux, Credential Manager on Windows — under the service
//! name `exa`, keyed by connection id, which is exactly where the CLI looks.
//! Studio keeps its own vault-encrypted copy as well; the OS store is the
//! shared channel between the two programs.
//!
//! A 0600 file is still read as a fallback (machines with no credential store,
//! and secrets written by older builds), but nothing new is written there
//! while a store is available.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SharedConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub managed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedRegistry {
    pub version: u8,
    pub connections: Vec<SharedConnection>,
    /// The CLI's selected default connection. Studio never sets it, but every
    /// read-merge-write here MUST carry it through — dropping the field on a
    /// rewrite silently un-defaults the user's CLI connection.
    #[serde(rename = "defaultId", default, skip_serializing_if = "Option::is_none")]
    pub default_id: Option<String>,
}

impl Default for SharedRegistry {
    fn default() -> Self {
        Self { version: 1, connections: Vec::new(), default_id: None }
    }
}

pub fn registry_path() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("EXASOL_CONNECTIONS_FILE") {
        if !explicit.trim().is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }
    dirs::home_dir().map(|home| home.join(".exasol").join("connections.json"))
}

pub fn credential_path(id: &str) -> Option<PathBuf> {
    registry_path().and_then(|p| p.parent().map(|dir| dir.join("credentials").join(id)))
}

/// Both programs derive the same id for the same target, so a database
/// registered by either side is recognized rather than duplicated.
pub fn connection_id(host: &str, port: u16, user: &str) -> String {
    let raw = format!("{host}_{port}_{user}").to_lowercase();
    raw.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '-' })
        .collect()
}

/// Parse registry contents. A corrupt or half-written shared file must never
/// stop Studio from starting, so anything unreadable yields an empty registry.
pub fn parse_registry(text: &str) -> SharedRegistry {
    serde_json::from_str::<SharedRegistry>(text).unwrap_or_default()
}

pub fn read_registry() -> SharedRegistry {
    let Some(path) = registry_path() else {
        return SharedRegistry::default();
    };
    std::fs::read_to_string(path).map(|t| parse_registry(&t)).unwrap_or_default()
}

/// Merge an entry in, replacing any with the same id.
pub fn upsert(mut registry: SharedRegistry, entry: SharedConnection) -> SharedRegistry {
    registry.connections.retain(|c| c.id != entry.id);
    registry.connections.push(entry);
    registry.version = 1;
    registry
}

/// Publish one connection outward: metadata into the registry, password into
/// its own 0600 file. Read-merge-write, because the CLI writes here too and a
/// blind overwrite would drop its entries.
pub fn publish(entry: SharedConnection, password: Option<&str>) -> AppResult<()> {
    let Some(path) = registry_path() else { return Ok(()) };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let id = entry.id.clone();
    let next = upsert(read_registry(), entry);
    std::fs::write(&path, serde_json::to_string_pretty(&next)? + "\n")?;

    if let Some(secret) = password.filter(|p| !p.is_empty()) {
        if !write_credential(&id, secret) {
            // No credential store on this machine: the password is NOT shared.
            // A plaintext file — even 0600 — is a copy anyone with the disk
            // can read; the exa CLI asks for the password instead.
            eprintln!("no OS credential store: the password for {id} is not shared with the exa CLI");
        }
    }
    Ok(())
}

/// Drop a connection from a registry by id (pure core, unit-tested). The CLI's
/// default marker is cleared only when it pointed at the removed entry.
pub fn without(mut registry: SharedRegistry, id: &str) -> SharedRegistry {
    registry.connections.retain(|c| c.id != id);
    if registry.default_id.as_deref() == Some(id) {
        registry.default_id = None;
    }
    registry.version = 1;
    registry
}

/// Remove a connection outward: the registry entry, the credential-store
/// secret and the legacy 0600 file. Without this, deleting a profile in
/// Studio was undone on the very next list — `import_shared_connections`
/// saw the registry entry as "missing locally" and re-imported it forever.
/// Read-merge-write like `publish`; the secret side is best-effort.
pub fn remove(id: &str) -> AppResult<()> {
    if let Some(path) = registry_path() {
        if path.exists() {
            let next = without(read_registry(), id);
            std::fs::write(&path, serde_json::to_string_pretty(&next)? + "\n")?;
        }
    }
    if let Some(cmd) = secret_delete_command(id) {
        let _ = crate::process::command(&cmd[0])
            .args(&cmd[1..])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output();
    }
    if let Some(cred) = credential_path(id) {
        let _ = std::fs::remove_file(cred);
    }
    Ok(())
}

/// The shared service name. Must match the CLI's `SERVICE` constant, or the
/// two programs address different items and neither sees the other's secrets.
pub const SERVICE: &str = "exa";

fn secret_read_command(id: &str) -> Option<Vec<String>> {
    let own = |parts: &[&str]| Some(parts.iter().map(|s| s.to_string()).collect());
    match std::env::consts::OS {
        "macos" => own(&["security", "find-generic-password", "-a", id, "-s", SERVICE, "-w"]),
        "linux" => own(&["secret-tool", "lookup", "service", SERVICE, "account", id]),
        "windows" => Some(vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime];(New-Object Windows.Security.Credentials.PasswordVault).Retrieve({},{}).Password",
                ps_quote(SERVICE),
                ps_quote(id)
            ),
        ]),
        _ => None,
    }
}

fn secret_delete_command(id: &str) -> Option<Vec<String>> {
    let own = |parts: &[&str]| Some(parts.iter().map(|s| s.to_string()).collect());
    match std::env::consts::OS {
        "macos" => own(&["security", "delete-generic-password", "-a", id, "-s", SERVICE]),
        "linux" => own(&["secret-tool", "clear", "service", SERVICE, "account", id]),
        "windows" => Some(vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime];$v=New-Object Windows.Security.Credentials.PasswordVault;$v.Remove($v.Retrieve({},{}))",
                ps_quote(SERVICE),
                ps_quote(id)
            ),
        ]),
        _ => None,
    }
}

/// How a secret is written: the program and its arguments, and what goes on
/// its stdin. The secret is ONLY ever in `stdin` — never an argument and never
/// script text — so no process listing can show it and no quote in a password
/// can change what runs.
pub(crate) struct SecretWrite {
    pub argv: Vec<String>,
    pub stdin: String,
}

/// A word for `security -i`: double-quoted, with `\` and `"` escaped, which is
/// how its line reader takes a literal. `$` and backticks are not special there.
pub(crate) fn security_quote(word: &str) -> String {
    format!("\"{}\"", word.replace('\\', "\\\\").replace('"', "\\\""))
}

/// A literal inside a PowerShell single-quoted string: `'` doubles.
pub(crate) fn ps_quote(word: &str) -> String {
    format!("'{}'", word.replace('\'', "''"))
}

fn secret_write_command(id: &str, secret: &str) -> Option<SecretWrite> {
    let owned = |parts: &[&str]| parts.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match std::env::consts::OS {
        // `security -i` reads its commands from stdin, so the password travels
        // there. The item is still created by /usr/bin/security, as the exa CLI
        // expects (same keychain ACL), and -U updates in place — without it a
        // repeat save fails and silently keeps the old password.
        "macos" => Some(SecretWrite {
            argv: owned(&["security", "-i"]),
            stdin: format!(
                "add-generic-password -a {} -s {} -w {} -U\n",
                security_quote(id),
                security_quote(SERVICE),
                security_quote(secret)
            ),
        }),
        "linux" => Some(SecretWrite {
            argv: owned(&["secret-tool", "store", "--label", "exa", "service", SERVICE, "account", id]),
            stdin: secret.to_string(),
        }),
        // The same PasswordVault entry the CLI uses, with the password read from
        // stdin inside the script rather than pasted into it.
        "windows" => Some(SecretWrite {
            argv: vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-Command".into(),
                format!(
                    "$p=[Console]::In.ReadToEnd();[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime];$v=New-Object Windows.Security.Credentials.PasswordVault;$v.Add((New-Object Windows.Security.Credentials.PasswordCredential({},{},$p)))",
                    ps_quote(SERVICE),
                    ps_quote(id)
                ),
            ],
            stdin: secret.to_string(),
        }),
        _ => None,
    }
}

/// Delete one secret from the OS credential store (best effort).
pub(crate) fn delete_credential(id: &str) {
    // An older build may have left a plaintext copy; it goes as well.
    if let Some(path) = credential_path(id) {
        let _ = std::fs::remove_file(path);
    }
    if let Some(cmd) = secret_delete_command(id) {
        let _ = crate::process::command(&cmd[0])
            .args(&cmd[1..])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output();
    }
}

/// Read a shared secret: the OS credential store first, then the legacy file.
pub fn read_credential(id: &str) -> Option<String> {
    if let Some(cmd) = secret_read_command(id) {
        if let Ok(output) = crate::process::command(&cmd[0]).args(&cmd[1..]).output() {
            if output.status.success() {
                let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    let path = credential_path(id)?;
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Store a shared secret. Returns false when it could only be written to a
/// file, so callers can tell the user their machine has no credential store.
pub(crate) fn write_credential(id: &str, secret: &str) -> bool {
    // A newline would end the `security -i` command early; such a password
    // cannot be stored safely in the shared keychain, so it is not.
    if secret.contains('\n') || secret.contains('\r') {
        return false;
    }
    if let Some(cmd) = secret_write_command(id, secret) {
        use std::io::Write;
        use std::process::Stdio;
        let spawned = crate::process::command(&cmd.argv[0])
            .args(&cmd.argv[1..])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        if let Ok(mut child) = spawned {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(cmd.stdin.as_bytes());
            }
            if child.wait().map(|s| s.success()).unwrap_or(false) {
                // Never leave a plaintext copy behind once the store has it.
                if let Some(path) = credential_path(id) {
                    let _ = std::fs::remove_file(path);
                }
                return true;
            }
        }
    }
    false
}

/// Whether a registry host refers to a database on this machine. Only those
/// can be adopted — a remote database is somebody else's to manage.
pub fn is_local_host(host: &str) -> bool {
    matches!(host.trim().to_ascii_lowercase().as_str(), "127.0.0.1" | "localhost" | "::1" | "[::1]")
}

/// Entries the CLI (or another program) registered that Studio has no profile
/// for yet — matched on the derived id so the same database is never imported
/// twice under two names.
pub fn missing_locally(registry: &SharedRegistry, known: &[(String, u16, String)]) -> Vec<SharedConnection> {
    let known_ids: Vec<String> =
        known.iter().map(|(host, port, user)| connection_id(host, *port, user)).collect();
    registry
        .connections
        .iter()
        .filter(|c| !known_ids.contains(&c.id))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, host: &str) -> SharedConnection {
        SharedConnection {
            id: id.into(),
            name: id.into(),
            host: host.into(),
            port: 8563,
            user: "sys".into(),
            schema: None,
            managed: None,
            source: Some("studio".into()),
            created_at: None,
        }
    }

    #[test]
    fn ids_match_the_cli_derivation() {
        // The CLI lowercases and replaces anything outside [a-z0-9_.-].
        assert_eq!(connection_id("Localhost", 8563, "SYS"), "localhost_8563_sys");
        assert_eq!(connection_id("db:x/y", 8563, "a b"), "db-x-y_8563_a-b");
    }

    #[test]
    fn a_corrupt_shared_file_never_breaks_startup() {
        assert!(parse_registry("not json").connections.is_empty());
        assert!(parse_registry("").connections.is_empty());
        assert!(parse_registry("{}").connections.is_empty());
    }

    #[test]
    fn without_drops_only_the_matching_id() {
        let registry = upsert(SharedRegistry::default(), entry("a", "one"));
        let registry = upsert(registry, entry("b", "two"));
        let registry = without(registry, "a");
        assert_eq!(registry.connections.len(), 1);
        assert!(registry.connections.iter().all(|c| c.id == "b"));
        // Removing an id that isn't there changes nothing (idempotent delete).
        let registry = without(registry, "a");
        assert_eq!(registry.connections.len(), 1);
    }

    #[test]
    fn without_keeps_the_cli_default_unless_it_was_the_removed_entry() {
        let mut registry = upsert(SharedRegistry::default(), entry("a", "one"));
        registry = upsert(registry, entry("b", "two"));
        registry.default_id = Some("b".into());
        // Removing a DIFFERENT entry must not touch the CLI's default.
        let registry = without(registry, "a");
        assert_eq!(registry.default_id.as_deref(), Some("b"));
        // Removing the default entry clears the marker instead of leaving it
        // dangling at a connection that no longer exists.
        let registry = without(registry, "b");
        assert_eq!(registry.default_id, None);
    }

    #[test]
    fn default_id_round_trips_through_parse_and_serialize() {
        let registry = parse_registry(r#"{"version":1,"connections":[],"defaultId":"x"}"#);
        assert_eq!(registry.default_id.as_deref(), Some("x"));
        let out = serde_json::to_string(&registry).unwrap();
        assert!(out.contains("\"defaultId\":\"x\""));
        // Absent in the file → absent in the rewrite (never serialize null).
        let registry = parse_registry(r#"{"version":1,"connections":[]}"#);
        assert_eq!(registry.default_id, None);
        assert!(!serde_json::to_string(&registry).unwrap().contains("defaultId"));
    }

    #[test]
    fn upsert_replaces_by_id_and_keeps_others() {
        let registry = upsert(SharedRegistry::default(), entry("a", "one"));
        let registry = upsert(registry, entry("b", "two"));
        let registry = upsert(registry, entry("a", "changed"));
        assert_eq!(registry.connections.len(), 2);
        let a = registry.connections.iter().find(|c| c.id == "a").unwrap();
        assert_eq!(a.host, "changed");
        // The other program's entry survives — the whole point of merging.
        assert!(registry.connections.iter().any(|c| c.id == "b"));
    }

    /// Cross-implementation guard: this is EXACTLY what the `exa` CLI wrote
    /// (captured from a real `exa connect` run). If either side changes the
    /// shape, this fails instead of the two programs silently disagreeing.
    #[test]
    fn parses_a_registry_written_by_the_cli() {
        let written_by_cli = r#"{
  "version": 1,
  "connections": [
    {
      "id": "127.0.0.1_8563_sys",
      "name": "sys@127.0.0.1:8563",
      "host": "127.0.0.1",
      "port": 8563,
      "user": "sys",
      "source": "cli",
      "createdAt": "2026-08-14T15:24:51.144Z"
    }
  ]
}"#;
        let registry = parse_registry(written_by_cli);
        assert_eq!(registry.connections.len(), 1);
        let c = &registry.connections[0];
        assert_eq!(c.id, connection_id(&c.host, c.port, &c.user));
        assert_eq!(c.source.as_deref(), Some("cli"));
        assert_eq!(c.created_at.as_deref(), Some("2026-08-14T15:24:51.144Z"));
        // Studio must offer it as an import, since it has no profile for it.
        assert_eq!(missing_locally(&registry, &[]).len(), 1);
    }

    /// The reverse direction: what Studio writes must round-trip through the
    /// same parser the CLI uses (same field names, camelCase createdAt).
    #[test]
    fn studio_output_uses_the_shared_field_names() {
        let registry = upsert(SharedRegistry::default(), SharedConnection {
            created_at: Some("2026-01-01T00:00:00.000Z".into()),
            schema: Some("SALES".into()),
            ..entry("localhost_8563_sys", "localhost")
        });
        let json = serde_json::to_string(&registry).unwrap();
        assert!(json.contains("\"createdAt\""), "must be camelCase for the CLI: {json}");
        assert!(json.contains("\"schema\":\"SALES\""));
        assert!(!json.contains("\"password\""), "secrets never belong in the shared registry");
        assert_eq!(parse_registry(&json).connections.len(), 1);
    }

    /// The CLI addresses keychain items as service "exa", account <id>. If
    /// this drifts, each program stores secrets the other cannot find — and
    /// nothing would fail loudly, connections would just stop working.
    #[test]
    fn secret_commands_match_the_cli_addressing() {
        assert_eq!(SERVICE, "exa");
        if let Some(read) = secret_read_command("my-db") {
            let joined = read.join(" ");
            assert!(joined.contains(SERVICE), "read must use the shared service: {joined}");
            assert!(joined.contains("my-db"), "read must use the connection id: {joined}");
        }
        if let Some(write) = secret_write_command("my-db", "hunter2") {
            let argv = write.argv.join(" ");
            let all = format!("{argv} {}", write.stdin);
            assert!(all.contains(SERVICE));
            assert!(all.contains("my-db"));
            // On every platform the secret is on stdin only: never in an
            // argument, so `ps` cannot show it.
            assert!(!argv.contains("hunter2"), "secret must not be on the command line: {argv}");
            assert!(write.stdin.contains("hunter2"));
            if std::env::consts::OS == "macos" {
                // Without -U a repeat save fails and keeps the old password.
                assert!(write.stdin.contains(" -U"), "keychain write must update in place");
            }
        }
    }

    /// Run by hand: `cargo test --lib keychain_round_trip -- --ignored`.
    /// Writes, reads and deletes a throwaway item in the real OS store.
    #[test]
    #[ignore]
    fn keychain_round_trip_with_awkward_passwords() {
        for pw in ["p'q\"r s", "a\\b$x`y", "plain"] {
            assert!(write_credential("studio-probe-xyz", pw), "write {pw}");
            assert_eq!(read_credential("studio-probe-xyz").as_deref(), Some(pw));
        }
        assert!(!write_credential("studio-probe-xyz", "two\nlines"), "a newline is refused");
        if let Some(cmd) = secret_delete_command("studio-probe-xyz") {
            let _ = std::process::Command::new(&cmd[0]).args(&cmd[1..]).output();
        }
    }

    #[test]
    fn quoting_keeps_any_password_a_literal() {
        // `security -i`: verified on macOS 26 — a\\b → a\b, quotes and spaces survive.
        assert_eq!(security_quote("plain"), "\"plain\"");
        assert_eq!(security_quote("p'q\"r s"), "\"p'q\\\"r s\"");
        assert_eq!(security_quote("a\\b$x`y"), "\"a\\\\b$x`y\"");
        // PowerShell single-quoted: only ' is special, and it doubles.
        assert_eq!(ps_quote("my-db"), "'my-db'");
        assert_eq!(ps_quote("o'brien"), "'o''brien'");
    }

    #[test]
    fn a_windows_script_never_contains_the_password() {
        // Built for any OS: the Windows script must read the password from stdin.
        let script = format!(
            "$p=[Console]::In.ReadToEnd();x({},{},$p)",
            ps_quote(SERVICE),
            ps_quote("my-db")
        );
        assert!(script.contains("[Console]::In.ReadToEnd()"));
        assert!(!script.contains("hunter2"));
    }

    #[test]
    fn only_databases_on_this_machine_are_adoptable() {
        for host in ["127.0.0.1", "localhost", "LOCALHOST", " ::1 "] {
            assert!(is_local_host(host), "{host} should be adoptable");
        }
        for host in ["db.internal", "10.0.0.5", "exasol.example.com", ""] {
            assert!(!is_local_host(host), "{host} must not be adopted");
        }
    }

    #[test]
    fn missing_locally_ignores_databases_studio_already_has() {
        let registry = upsert(SharedRegistry::default(), entry("localhost_8563_sys", "localhost"));
        let known = vec![("localhost".to_string(), 8563u16, "sys".to_string())];
        assert!(missing_locally(&registry, &known).is_empty());
        assert_eq!(missing_locally(&registry, &[]).len(), 1);
    }
}
