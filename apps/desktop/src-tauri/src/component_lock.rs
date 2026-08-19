//! Build-time generated, immutable component selection used by first-install.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeComponents {
    pub schema_version: u8,
    pub generated_by: String,
    pub generated_at: String,
    pub personal: ReleaseComponent,
    pub nano: ContainerComponent,
    pub uv: ReleaseComponent,
    pub python_stack: PythonStack,
    pub exapump: ReleaseComponent,
}

#[derive(Debug, Deserialize)]
pub struct ReleaseComponent {
    pub repository: String,
    pub version: String,
    pub artifacts: BTreeMap<String, Artifact>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub executable_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ContainerComponent {
    pub registry: String,
    pub repository: String,
    pub tag: String,
    pub digest: String,
}

impl ContainerComponent {
    pub fn immutable_image(&self) -> String {
        format!("{}/{}@{}", self.registry, self.repository, self.digest)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonStack {
    pub python_version: String,
    pub pyexasol_version: String,
    pub mcp_server_version: String,
    pub lock_sha256: String,
}

pub fn platform_key() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub fn artifact_for(component: &ReleaseComponent) -> Option<&Artifact> {
    component.artifacts.get(&platform_key())
}

/// The signed remote override, when one has been resolved at startup (see
/// verified_lock + init_effective). Empty → the baked lock is in force.
static EFFECTIVE: OnceLock<RuntimeComponents> = OnceLock::new();

/// Resolve the effective verified lock ONCE at startup: use the signed remote
/// override when it verifies + is newer than the baked lock, otherwise leave the
/// baked lock in force. Must be called before anything reads `components()`.
pub fn init_effective(data_dir: &std::path::Path) {
    if EFFECTIVE.get().is_some() {
        return;
    }
    if let Some(over) = crate::verified_lock::resolve_override(baked(), data_dir) {
        let _ = EFFECTIVE.set(over);
    }
}

/// The verified component set in force: the signed remote override when present,
/// else the app-baked lock.
pub fn components() -> &'static RuntimeComponents {
    EFFECTIVE.get().unwrap_or_else(baked)
}

fn baked() -> &'static RuntimeComponents {
    static COMPONENTS: OnceLock<RuntimeComponents> = OnceLock::new();
    COMPONENTS.get_or_init(|| {
        let parsed: RuntimeComponents =
            serde_json::from_str(include_str!("../resources/runtime-components.lock.json"))
                .expect("generated runtime-components.lock.json must be valid");
        assert_eq!(
            parsed.schema_version, 1,
            "unsupported runtime component lock"
        );
        assert!(parsed
            .generated_by
            .ends_with("refresh_runtime_components.py"));
        assert!(parsed.generated_at.ends_with('Z'));
        for release in [&parsed.personal, &parsed.uv, &parsed.exapump] {
            assert!(!release.repository.is_empty());
        }
        assert!(!parsed.nano.tag.is_empty());
        parsed
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_sha256(value: &str) -> bool {
        value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
    }

    #[test]
    fn generated_lock_has_immutable_artifacts() {
        let lock = components();
        assert!(lock.generated_by.ends_with("refresh_runtime_components.py"));
        assert!(!lock.generated_at.is_empty());
        assert!(lock.nano.digest.starts_with("sha256:"));
        assert!(is_sha256(lock.nano.digest.trim_start_matches("sha256:")));
        assert!(!lock.nano.tag.is_empty());
        assert!(is_sha256(&lock.python_stack.lock_sha256));
        for component in [&lock.personal, &lock.uv, &lock.exapump] {
            assert!(!component.repository.is_empty());
            assert!(!component.version.is_empty());
            for artifact in component.artifacts.values() {
                assert!(artifact.url.starts_with("https://"));
                assert!(is_sha256(&artifact.sha256));
            }
        }
        for component in [&lock.personal, &lock.uv] {
            for artifact in component.artifacts.values() {
                assert!(artifact.executable_sha256.as_deref().is_some_and(is_sha256));
            }
        }
    }
}
