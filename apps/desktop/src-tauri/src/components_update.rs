//! Independent, isolated component management.
//!
//! Each managed component installs into its OWN directory (and, for Python
//! components, its OWN virtualenv) and records its OWN version in an
//! `installed.json` manifest — so a component can be updated on its own,
//! without a Studio release and without disturbing any other component. This
//! module is the pure core: component identity, per-component paths, the
//! manifest, and version comparison. The install/update actions that use it
//! live alongside the local-database machinery.
//!
//! Slice 1 of the independent-component-updates change
//! (openspec/changes/independent-component-updates): a few helpers here are
//! consumed by the next slice (per-component env + update command), so this
//! foundation module tolerates not-yet-wired items until then.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::AppResult;
use crate::storage::write_json;

/// The managed components a user can update independently.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComponentId {
    /// The local Exasol database engine (binary).
    Personal,
    /// ExaPump data/SQL CLI (binary).
    ExaPump,
    /// Exasol MCP server (Python, its own venv).
    McpServer,
    /// Semantic Views framework (installed DB-side, versioned by revision).
    SemanticViews,
}

impl ComponentId {
    /// Stable on-disk slug (also the component key in the UI).
    pub fn slug(self) -> &'static str {
        match self {
            ComponentId::Personal => "personal",
            ComponentId::ExaPump => "exapump",
            ComponentId::McpServer => "mcp-server",
            ComponentId::SemanticViews => "semantic-views",
        }
    }

    /// Human-facing name.
    pub fn display(self) -> &'static str {
        match self {
            ComponentId::Personal => "Exasol Personal",
            ComponentId::ExaPump => "ExaPump",
            ComponentId::McpServer => "Exasol MCP Server",
            ComponentId::SemanticViews => "Semantic Views",
        }
    }

    /// Whether the component runs from its own isolated Python virtualenv
    /// (vs. a standalone binary or a DB-side install).
    pub fn has_own_env(self) -> bool {
        matches!(self, ComponentId::McpServer)
    }

    pub fn from_slug(slug: &str) -> Option<ComponentId> {
        Some(match slug {
            "personal" => ComponentId::Personal,
            "exapump" => ComponentId::ExaPump,
            "mcp-server" => ComponentId::McpServer,
            "semantic-views" => ComponentId::SemanticViews,
            _ => return None,
        })
    }
}

/// A component's isolated install root:
/// `<data_dir>/personal-local/components/<slug>`.
pub fn component_dir(data_dir: &Path, id: ComponentId) -> PathBuf {
    data_dir
        .join("personal-local")
        .join("components")
        .join(id.slug())
}

/// A Python component's own virtualenv: `<component_dir>/env`.
pub fn component_env(data_dir: &Path, id: ComponentId) -> PathBuf {
    component_dir(data_dir, id).join("env")
}

/// The venv interpreter inside a component's own env.
pub fn component_env_python(data_dir: &Path, id: ComponentId) -> PathBuf {
    let env = component_env(data_dir, id);
    if cfg!(windows) {
        env.join("Scripts/python.exe")
    } else {
        env.join("bin/python")
    }
}

fn manifest_path(data_dir: &Path, id: ComponentId) -> PathBuf {
    component_dir(data_dir, id).join("installed.json")
}

/// What version of a component is installed, and where it came from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InstalledManifest {
    /// The installed version/revision string, verbatim.
    pub version: String,
    /// RFC-3339 timestamp of the install.
    pub installed_at: String,
    /// "verified" (Studio's pinned baseline) or "upstream" (independently
    /// updated past the pin). Drives the "Revert to verified" affordance.
    #[serde(default)]
    pub channel: Option<String>,
}

/// Read a component's install manifest, or None when it isn't installed / the
/// file is missing or unreadable.
pub fn read_manifest(data_dir: &Path, id: ComponentId) -> Option<InstalledManifest> {
    let raw = std::fs::read_to_string(manifest_path(data_dir, id)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Persist a component's install manifest (creates the component dir).
pub fn write_manifest(data_dir: &Path, id: ComponentId, manifest: &InstalledManifest) -> AppResult<()> {
    write_json(&manifest_path(data_dir, id), manifest)
}

/// True when `remote` is a strictly newer version than `local`.
///
/// Numeric-segment comparison ("v2.1.10" > "2.1.9"); a `v`/`V` prefix is
/// ignored and shorter versions are zero-padded ("2.1" == "2.1.0"). Any
/// non-numeric segment falls back to plain inequality (can't order it safely).
pub fn is_newer(remote: &str, local: &str) -> bool {
    let normalize = |value: &str| -> Vec<Option<u64>> {
        value
            .trim_start_matches(['v', 'V'])
            .split(|c: char| c == '.' || c == '-' || c == '+')
            .map(|part| part.parse::<u64>().ok())
            .collect()
    };
    let (remote_parts, local_parts) = (normalize(remote), normalize(local));
    if remote_parts.iter().any(Option::is_none) || local_parts.iter().any(Option::is_none) {
        return remote.trim_start_matches(['v', 'V']) != local.trim_start_matches(['v', 'V']);
    }
    let width = remote_parts.len().max(local_parts.len());
    for i in 0..width {
        let r = remote_parts.get(i).copied().flatten().unwrap_or(0);
        let l = local_parts.get(i).copied().flatten().unwrap_or(0);
        if r != l {
            return r > l;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_roundtrips() {
        for id in [ComponentId::Personal, ComponentId::ExaPump, ComponentId::McpServer, ComponentId::SemanticViews] {
            assert_eq!(ComponentId::from_slug(id.slug()), Some(id));
        }
        assert_eq!(ComponentId::from_slug("nope"), None);
    }

    #[test]
    fn only_mcp_has_its_own_env() {
        assert!(ComponentId::McpServer.has_own_env());
        assert!(!ComponentId::Personal.has_own_env());
        assert!(!ComponentId::ExaPump.has_own_env());
        assert!(!ComponentId::SemanticViews.has_own_env());
    }

    #[test]
    fn paths_are_isolated_per_component() {
        let base = Path::new("/data");
        let mcp = component_dir(base, ComponentId::McpServer);
        let pump = component_dir(base, ComponentId::ExaPump);
        assert!(mcp.ends_with("personal-local/components/mcp-server"));
        assert_ne!(mcp, pump);
        assert!(component_env(base, ComponentId::McpServer).ends_with("mcp-server/env"));
    }

    #[test]
    fn manifest_round_trips() {
        let dir = std::env::temp_dir().join(format!("cu-test-{}", std::process::id()));
        let data = dir.as_path();
        let m = InstalledManifest {
            version: "2.0.0".into(),
            installed_at: "2026-07-31T00:00:00Z".into(),
            channel: Some("upstream".into()),
        };
        write_manifest(data, ComponentId::McpServer, &m).unwrap();
        assert_eq!(read_manifest(data, ComponentId::McpServer), Some(m));
        // Absent component reads as None.
        assert_eq!(read_manifest(data, ComponentId::ExaPump), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn is_newer_compares_numeric_segments() {
        assert!(is_newer("2.0.0", "1.10.1"));
        assert!(is_newer("v2.1.10", "2.1.9"));
        assert!(!is_newer("1.10.1", "1.10.1")); // equal
        assert!(!is_newer("1.9.0", "1.10.0")); // 9 < 10 by segment, not string
        assert!(is_newer("2.1", "2.0.9")); // shorter is zero-padded
        assert!(!is_newer("2.0", "2.0.0")); // equal after padding
    }

    #[test]
    fn is_newer_handles_nonnumeric_tags_by_inequality() {
        assert!(is_newer("nightly-abc", "nightly-def")); // non-numeric -> newer-by-inequality
        assert!(!is_newer("nightly", "nightly")); // identical -> not newer
    }
}
