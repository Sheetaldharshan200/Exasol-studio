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
//! Passwords: Studio encrypts its own copy with the vault key, which the CLI
//! cannot read. Sharing therefore means writing the password to the shared
//! credential file at 0600 — the same convention `~/.netrc`, `~/.pgpass` and
//! the Exasol starter kit already use. Without it a shared connection is
//! useless to the other program.

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
}

impl Default for SharedRegistry {
    fn default() -> Self {
        Self { version: 1, connections: Vec::new() }
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

    if let (Some(secret), Some(cred)) = (password.filter(|p| !p.is_empty()), credential_path(&id)) {
        if let Some(dir) = cred.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(&cred, secret)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&cred, std::fs::Permissions::from_mode(0o600));
        }
    }
    Ok(())
}

pub fn read_credential(id: &str) -> Option<String> {
    let path = credential_path(id)?;
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string())
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

    #[test]
    fn missing_locally_ignores_databases_studio_already_has() {
        let registry = upsert(SharedRegistry::default(), entry("localhost_8563_sys", "localhost"));
        let known = vec![("localhost".to_string(), 8563u16, "sys".to_string())];
        assert!(missing_locally(&registry, &known).is_empty());
        assert_eq!(missing_locally(&registry, &[]).len(), 1);
    }
}
