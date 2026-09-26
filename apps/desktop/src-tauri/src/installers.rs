//! Installing a catalogue item from its coordinate.
//!
//! The marketplace used to install by matching an item's **id** — eight
//! branches, which is why a catalogue of 147 items had installers for eight.
//! Here the item names its mechanism and that mechanism's coordinate, and
//! nothing below learns a single item's name. Adding an item is a line of
//! data, not a branch.
//!
//! Every artifact is checked against a digest the publisher provides. Where
//! none exists the install still proceeds — that is the same rule the release
//! path already followed — but a digest that is published and does NOT match
//! is always a refusal.

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

/// Where an item's artifact comes from. Mirrors `InstallSource` in
/// apps/desktop/src/features/marketplace/catalog-data.ts.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum InstallSource {
    Pypi {
        package: String,
    },
    Maven {
        group: String,
        artifact: String,
    },
    #[serde(rename_all = "camelCase")]
    GhAsset {
        asset_pattern: String,
        #[serde(default)]
        on_path: bool,
    },
    Registry {
        registry: String,
        package: String,
    },
    #[serde(rename_all = "camelCase")]
    HostPlugin {
        asset_pattern: String,
        host: String,
    },
}

/// Maven Central's path for one release of one artifact.
///
/// The coordinate is a directory path with dots in the group replaced by
/// slashes; the file repeats the artifact and version. Built here rather than
/// searched for, so an install cannot silently resolve to another project.
pub fn maven_jar_url(group: &str, artifact: &str, version: &str) -> String {
    let path = group.replace('.', "/");
    format!("https://repo1.maven.org/maven2/{path}/{artifact}/{version}/{artifact}-{version}.jar")
}

/// The file name a Maven artifact lands under.
pub fn maven_jar_name(artifact: &str, version: &str) -> String {
    format!("{artifact}-{version}.jar")
}

/// A version string as Maven Central addresses it — release tags often carry
/// a `v` prefix that the repository path does not.
pub fn maven_version(tag: &str) -> String {
    tag.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

/// Whether a published digest matches what was downloaded.
///
/// `None` for the expectation means the publisher published none, which is
/// not a failure — it is the same position the release path has always been
/// in for older releases. A published digest that disagrees is always a
/// refusal, whatever its case or `sha256:` prefix.
pub fn digest_ok(expected: Option<&str>, bytes: &[u8]) -> bool {
    let Some(expected) = expected else { return true };
    let want = expected.trim().trim_start_matches("sha256:").to_ascii_lowercase();
    if want.len() != 64 {
        return true; // not a sha256 — nothing to compare against
    }
    format!("{:x}", Sha256::digest(bytes)) == want
}

/// The same, for Maven Central, which publishes `.sha1` beside every artifact.
pub fn sha1_ok(expected: Option<&str>, bytes: &[u8]) -> bool {
    let Some(expected) = expected else { return true };
    let want = expected.split_whitespace().next().unwrap_or_default().to_ascii_lowercase();
    if want.len() != 40 {
        return true;
    }
    use sha1::Sha1;
    format!("{:x}", Sha1::digest(bytes)) == want
}

/// Refuse a download whose publisher-declared digest disagrees.
pub fn verify(name: &str, expected: Option<&str>, bytes: &[u8], sha1: bool) -> AppResult<()> {
    let ok = if sha1 { sha1_ok(expected, bytes) } else { digest_ok(expected, bytes) };
    if ok {
        return Ok(());
    }
    Err(AppError::Storage(format!(
        "{name} does not match the checksum its publisher declared — discarded."
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_maven_coordinate_becomes_one_exact_url() {
        // Built, not searched: an install must not be able to resolve to a
        // different project that happens to share an artifact name.
        assert_eq!(
            maven_jar_url("com.exasol", "bucketfs-java", "5.0.1"),
            "https://repo1.maven.org/maven2/com/exasol/bucketfs-java/5.0.1/bucketfs-java-5.0.1.jar"
        );
        assert_eq!(maven_jar_name("bucketfs-java", "5.0.1"), "bucketfs-java-5.0.1.jar");
    }

    #[test]
    fn a_release_tags_v_prefix_is_not_part_of_the_maven_version() {
        assert_eq!(maven_version("v2.0.4"), "2.0.4");
        assert_eq!(maven_version("2.0.4"), "2.0.4");
        assert_eq!(maven_version(" V1.0 "), "1.0");
    }

    #[test]
    fn a_matching_digest_passes_whatever_its_shape() {
        let body = b"hello";
        let hex = format!("{:x}", Sha256::digest(body));
        assert!(digest_ok(Some(&hex), body));
        assert!(digest_ok(Some(&hex.to_uppercase()), body));
        assert!(digest_ok(Some(&format!("sha256:{hex}")), body));
    }

    #[test]
    fn a_published_digest_that_disagrees_is_refused() {
        let wrong = "0".repeat(64);
        assert!(!digest_ok(Some(&wrong), b"hello"));
        assert!(verify("thing.jar", Some(&wrong), b"hello", false).is_err());
    }

    #[test]
    fn no_published_digest_is_not_a_failure() {
        // Older releases publish none. Refusing those would make half the
        // catalogue uninstallable to buy nothing.
        assert!(digest_ok(None, b"hello"));
        assert!(verify("thing.jar", None, b"hello", false).is_ok());
    }

    #[test]
    fn something_that_is_not_a_sha256_is_not_treated_as_one() {
        // A digest GitHub reports in another algorithm must not be compared
        // as if it were sha256 and fail everything.
        assert!(digest_ok(Some("md5:abc"), b"hello"));
        assert!(digest_ok(Some(""), b"hello"));
    }

    #[test]
    fn maven_checksums_are_sha1_and_carry_a_trailing_filename() {
        let body = b"jar bytes";
        use sha1::Sha1;
        let hex = format!("{:x}", Sha1::digest(body));
        assert!(sha1_ok(Some(&hex), body));
        assert!(sha1_ok(Some(&format!("{hex}  thing.jar")), body));
        assert!(!sha1_ok(Some(&"0".repeat(40)), body));
    }

    #[test]
    fn a_source_deserializes_from_what_the_catalogue_writes() {
        let gh: InstallSource = serde_json::from_str(
            r#"{"kind":"gh-asset","assetPattern":"\\.jar$","onPath":true}"#,
        )
        .unwrap();
        assert_eq!(gh, InstallSource::GhAsset { asset_pattern: "\\.jar$".into(), on_path: true });

        let mv: InstallSource =
            serde_json::from_str(r#"{"kind":"maven","group":"com.exasol","artifact":"bucketfs-java"}"#).unwrap();
        assert_eq!(mv, InstallSource::Maven { group: "com.exasol".into(), artifact: "bucketfs-java".into() });

        // onPath defaults to false — a library must not land on PATH because
        // someone forgot the flag.
        let lib: InstallSource = serde_json::from_str(r#"{"kind":"gh-asset","assetPattern":"x"}"#).unwrap();
        assert_eq!(lib, InstallSource::GhAsset { asset_pattern: "x".into(), on_path: false });
    }
}
