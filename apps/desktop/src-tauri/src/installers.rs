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

/// Where to ask a registry for a package's newest version.
///
/// npm needs the scope slash percent-encoded in the metadata path but NOT in
/// the tarball path, which is the kind of detail that was previously spelled
/// out once per package inside a match arm.
pub fn registry_latest_url(registry: &str, package: &str) -> Option<String> {
    Some(match registry {
        "npm" => format!("https://registry.npmjs.org/{}/latest", package.replace('/', "%2F")),
        "goproxy" => format!("https://proxy.golang.org/{package}/@latest"),
        "crates" => format!("https://crates.io/api/v1/crates/{package}"),
        _ => return None,
    })
}

/// Where that version's artifact is.
pub fn registry_download_url(registry: &str, package: &str, version: &str) -> Option<String> {
    Some(match registry {
        // The tarball is named for the UNSCOPED package, under the scoped path.
        "npm" => {
            let bare = package.rsplit('/').next().unwrap_or(package);
            format!("https://registry.npmjs.org/{package}/-/{bare}-{version}.tgz")
        }
        "goproxy" => format!("https://proxy.golang.org/{package}/@v/{version}.zip"),
        "crates" => format!("https://crates.io/api/v1/crates/{package}/{version}/download"),
        _ => return None,
    })
}

/// The file an artifact lands under.
pub fn registry_file_name(registry: &str, package: &str, version: &str) -> Option<String> {
    let bare = package.rsplit('/').next().unwrap_or(package);
    Some(match registry {
        "npm" => format!("{bare}-{version}.tgz"),
        "goproxy" => format!("{bare}-{version}.zip"),
        "crates" => format!("{bare}-{version}.crate"),
        _ => return None,
    })
}

/// Where in a registry's "latest" response the version sits.
pub fn registry_version_path(registry: &str) -> Option<&'static [&'static str]> {
    Some(match registry {
        "npm" => &["version"],
        "goproxy" => &["Version"],
        "crates" => &["crate", "max_stable_version"],
        _ => return None,
    })
}

/// How to add the package to a project instead, for the hint on the card.
pub fn registry_hint(registry: &str, package: &str) -> Option<String> {
    Some(match registry {
        "npm" => format!("npm package — or add it to a project with `npm i {package}`"),
        "goproxy" => format!("Go module zip — or add it to a project with `go get {package}`"),
        "crates" => format!("crates.io package — or add it to a project with `cargo add {package}`"),
        _ => return None,
    })
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
    fn npm_encodes_the_scope_for_metadata_but_not_for_the_tarball() {
        // The one asymmetry that made these worth spelling out once rather
        // than once per package.
        assert_eq!(
            registry_latest_url("npm", "@exasol/exasol-driver-ts").unwrap(),
            "https://registry.npmjs.org/@exasol%2Fexasol-driver-ts/latest"
        );
        assert_eq!(
            registry_download_url("npm", "@exasol/exasol-driver-ts", "1.2.3").unwrap(),
            "https://registry.npmjs.org/@exasol/exasol-driver-ts/-/exasol-driver-ts-1.2.3.tgz"
        );
        assert_eq!(registry_file_name("npm", "@exasol/exasol-driver-ts", "1.2.3").unwrap(), "exasol-driver-ts-1.2.3.tgz");
    }

    #[test]
    fn go_and_crates_build_the_urls_their_proxies_use() {
        assert_eq!(
            registry_latest_url("goproxy", "github.com/exasol/exasol-driver-go").unwrap(),
            "https://proxy.golang.org/github.com/exasol/exasol-driver-go/@latest"
        );
        assert_eq!(
            registry_download_url("goproxy", "github.com/exasol/exasol-driver-go", "v1.0.0").unwrap(),
            "https://proxy.golang.org/github.com/exasol/exasol-driver-go/@v/v1.0.0.zip"
        );
        assert_eq!(
            registry_download_url("crates", "exarrow-rs", "0.3.0").unwrap(),
            "https://crates.io/api/v1/crates/exarrow-rs/0.3.0/download"
        );
    }

    #[test]
    fn each_registry_says_where_its_version_field_lives() {
        assert_eq!(registry_version_path("npm"), Some(&["version"][..]));
        assert_eq!(registry_version_path("goproxy"), Some(&["Version"][..]));
        assert_eq!(registry_version_path("crates"), Some(&["crate", "max_stable_version"][..]));
    }

    #[test]
    fn an_unknown_registry_resolves_to_nothing_rather_than_a_wrong_url() {
        assert_eq!(registry_latest_url("pypi-ish", "x"), None);
        assert_eq!(registry_download_url("pypi-ish", "x", "1"), None);
        assert_eq!(registry_file_name("pypi-ish", "x", "1"), None);
        assert_eq!(registry_version_path("pypi-ish"), None);
        assert_eq!(registry_hint("pypi-ish", "x"), None);
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
