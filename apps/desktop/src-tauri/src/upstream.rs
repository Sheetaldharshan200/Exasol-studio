//! Upstream (official GitHub release) component updates.
//!
//! The verified lock stays the known-good baseline, but components must not be
//! COUPLED to Studio releases: when an official release is newer than the
//! verified pin, the Marketplace offers it directly. Verify-or-refuse still
//! holds — the hash comes from the digest GitHub publishes per release asset,
//! and an asset without a digest is refused, never installed unverified.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

use crate::component_lock::Artifact;
use crate::error::{AppError, AppResult};

pub struct UpstreamAsset {
    pub name: String,
    pub url: String,
    /// GitHub's per-asset digest, e.g. "sha256:<64 hex>". None on old releases.
    pub digest: Option<String>,
}

pub struct UpstreamRelease {
    pub tag: String,
    pub assets: Vec<UpstreamAsset>,
}

/// Why a release could not be read.
///
/// It used to be `None` for everything, so the only thing the app could say
/// was "Could not read the latest release of X" — which sent people looking
/// for a typo or a network problem when the real answer was almost always a
/// rate limit with twenty minutes left on it.
#[derive(Debug, PartialEq)]
pub enum ReleaseError {
    /// GitHub's unauthenticated allowance for this machine is spent.
    RateLimited { resets_in_secs: Option<u64> },
    NotFound,
    Unavailable(String),
}

impl std::fmt::Display for ReleaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReleaseError::RateLimited { resets_in_secs } => {
                write!(f, "GitHub's hourly limit for this machine is used up. It allows 60 requests an hour without a sign-in, and reading a release costs one")?;
                match resets_in_secs {
                    Some(secs) => write!(f, "; it resets in about {} minute(s).", secs.div_ceil(60)),
                    None => write!(f, "; it resets within the hour."),
                }
            }
            ReleaseError::NotFound => write!(f, "GitHub has no such release — the repository may have been renamed, or it has never published one."),
            ReleaseError::Unavailable(why) => write!(f, "GitHub could not be reached ({why})."),
        }
    }
}

/// What a response means, from its status and headers alone.
///
/// Separated from the request so the rule is testable: a 403 with the rate
/// limit exhausted and a 403 for anything else are very different messages.
pub(crate) fn classify_failure(status: u16, remaining: Option<&str>, reset_epoch: Option<&str>, now: u64) -> ReleaseError {
    if status == 404 {
        return ReleaseError::NotFound;
    }
    if (status == 403 || status == 429) && remaining.map(|r| r.trim() == "0").unwrap_or(false) {
        let resets_in_secs = reset_epoch
            .and_then(|r| r.trim().parse::<u64>().ok())
            .map(|at| at.saturating_sub(now));
        return ReleaseError::RateLimited { resets_in_secs };
    }
    ReleaseError::Unavailable(format!("HTTP {status}"))
}

fn fetch_release_detailed(repo: &str, release_path: &str) -> Result<UpstreamRelease, ReleaseError> {
    let response = reqwest::blocking::Client::new()
        .get(format!("https://api.github.com/repos/{repo}/releases/{release_path}"))
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .map_err(|e| ReleaseError::Unavailable(e.to_string()))?;

    if !response.status().is_success() {
        let header = |k: &str| response.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        return Err(classify_failure(
            response.status().as_u16(),
            header("x-ratelimit-remaining").as_deref(),
            header("x-ratelimit-reset").as_deref(),
            now,
        ));
    }

    let body: Value = response.json().map_err(|e| ReleaseError::Unavailable(e.to_string()))?;
    let parse = || -> Option<UpstreamRelease> {
        let tag = body.get("tag_name")?.as_str()?.to_string();
        let assets = body
            .get("assets")?
            .as_array()?
            .iter()
            .filter_map(|a| {
                Some(UpstreamAsset {
                    name: a.get("name")?.as_str()?.to_string(),
                    url: a.get("browser_download_url")?.as_str()?.to_string(),
                    digest: a.get("digest").and_then(Value::as_str).map(str::to_string),
                })
            })
            .collect();
        Some(UpstreamRelease { tag, assets })
    };
    parse().ok_or_else(|| ReleaseError::Unavailable("the release GitHub returned had no tag".into()))
}

fn fetch_release(repo: &str, release_path: &str) -> Option<UpstreamRelease> {
    fetch_release_detailed(repo, release_path).ok()
}

/// The newest tag from a repository's releases Atom feed.
///
/// Entry ids look like `tag:github.com,2008:Repository/<id>/<tag>`; the feed
/// is newest-first.
pub(crate) fn parse_atom_tag(xml: &str) -> Option<String> {
    let at = xml.find("tag:github.com,2008:Repository/")?;
    let rest = &xml[at..];
    let after_repo = rest.find('/').map(|i| &rest[i + 1..])?;
    let tag = after_repo.split('/').nth(1)?.split('<').next()?.trim();
    (!tag.is_empty()).then(|| tag.to_string())
}

/// Asset file names from a release's asset fragment, in page order.
pub(crate) fn parse_expanded_assets(html: &str, tag: &str) -> Vec<String> {
    let needle = format!("releases/download/{tag}/");
    let mut out = Vec::new();
    for part in html.split(&needle).skip(1) {
        let name = part.split(['"', '\'', '<', '?', '#']).next().unwrap_or_default().trim();
        if !name.is_empty() && !out.iter().any(|n| n == name) {
            out.push(name.to_string());
        }
    }
    out
}

/// The newest release read from github.com instead of the API.
///
/// api.github.com allows 60 requests an hour without a sign-in — for
/// everything the app does — and reading one release costs one, so a machine
/// that has browsed the marketplace can have nothing left when it comes to
/// install something. These pages are NOT the API and are not counted against
/// that allowance: the Atom feed carries the newest tag, the release's asset
/// fragment carries the file names, and a download URL is
/// `releases/download/<tag>/<name>` by construction.
///
/// Digests are left None here and resolved per asset by `sha256_sibling`,
/// so only the file actually being installed costs a request.
fn fetch_latest_without_api(repo: &str) -> Result<UpstreamRelease, ReleaseError> {
    let client = reqwest::blocking::Client::new();
    let get = |url: String| -> Result<String, ReleaseError> {
        let r = client
            .get(&url)
            .header("User-Agent", "exasol-studio")
            .timeout(Duration::from_secs(20))
            .send()
            .map_err(|e| ReleaseError::Unavailable(e.to_string()))?;
        if r.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(ReleaseError::NotFound);
        }
        if !r.status().is_success() {
            return Err(ReleaseError::Unavailable(format!("HTTP {}", r.status().as_u16())));
        }
        r.text().map_err(|e| ReleaseError::Unavailable(e.to_string()))
    };

    let feed = get(format!("https://github.com/{repo}/releases.atom"))?;
    let tag = parse_atom_tag(&feed).ok_or(ReleaseError::NotFound)?;
    let fragment = get(format!("https://github.com/{repo}/releases/expanded_assets/{tag}"))?;
    let assets = parse_expanded_assets(&fragment, &tag)
        .into_iter()
        .map(|name| UpstreamAsset {
            url: format!("https://github.com/{repo}/releases/download/{tag}/{name}"),
            name,
            digest: None,
        })
        .collect();
    Ok(UpstreamRelease { tag, assets })
}

/// The `sha256` GitHub serves beside an asset, when the project publishes one.
///
/// The file holds `<hex>  <filename>`; only the hash is taken. Also on
/// github.com, so it costs nothing against the API allowance — which is what
/// lets an install stay verified when the API itself is unreachable.
pub fn sha256_sibling(asset_url: &str) -> Option<String> {
    let body = reqwest::blocking::Client::new()
        .get(format!("{asset_url}.sha256"))
        .header("User-Agent", "exasol-studio")
        .timeout(Duration::from_secs(20))
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .ok()?;
    let hex = body.split_whitespace().next()?;
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit())).then(|| hex.to_lowercase())
}

pub fn latest(repo: &str) -> Option<UpstreamRelease> {
    fetch_release(repo, "latest")
}

/// The newest release, or WHY not — for the paths that show the reason to a
/// person rather than quietly degrading.
pub fn latest_detailed(repo: &str) -> Result<UpstreamRelease, ReleaseError> {
    match fetch_release_detailed(repo, "latest") {
        // A spent allowance is not a reason to fail: the same release is
        // readable from github.com, which is not rate limited.
        Err(ReleaseError::RateLimited { .. }) => fetch_latest_without_api(repo),
        other => other,
    }
}

pub fn by_tag(repo: &str, tag: &str) -> Option<UpstreamRelease> {
    fetch_release(repo, &format!("tags/{tag}"))
}

fn common_suffix_len(a: &str, b: &str) -> usize {
    a.bytes().rev().zip(b.bytes().rev()).take_while(|(x, y)| x == y).count()
}

/// The release asset that corresponds to the verified lock's artifact for this
/// platform: names embed a version but end in a stable platform suffix
/// ("…-macos-aarch64", "…_macOS_arm64.tar.gz"), so the longest common suffix
/// with the lock's artifact name identifies the right asset. The suffix must
/// be at least 12 chars — a bare architecture tail like "-aarch64" (8) is
/// shared across OSes ("…-linux-aarch64" vs "…-macos-aarch64") and would pick
/// a wrong-OS binary when the right one is missing; digest verification can't
/// catch that. Ties are ambiguity — None, not a guess.
const MIN_ASSET_SUFFIX: usize = 12;

pub fn pick_asset<'a>(lock_name: &str, assets: &'a [UpstreamAsset]) -> Option<&'a UpstreamAsset> {
    let mut scored: Vec<(usize, &UpstreamAsset)> = assets
        .iter()
        .map(|a| (common_suffix_len(lock_name, &a.name), a))
        .filter(|(len, _)| *len >= MIN_ASSET_SUFFIX)
        .collect();
    scored.sort_by_key(|(len, _)| std::cmp::Reverse(*len));
    match scored.as_slice() {
        [] => None,
        [(best, asset), rest @ ..] => {
            if rest.first().is_some_and(|(second, _)| second == best) {
                return None; // two equally-good candidates — ambiguous
            }
            let _ = best;
            Some(asset)
        }
    }
}

/// A hash-verified Artifact from a release asset — or None when GitHub
/// published no usable sha256 digest for it (verify-or-refuse).
pub fn artifact_from(asset: &UpstreamAsset) -> Option<Artifact> {
    let sha = asset.digest.as_deref()?.strip_prefix("sha256:")?.to_ascii_lowercase();
    if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some(Artifact {
        name: asset.name.clone(),
        url: asset.url.clone(),
        sha256: sha,
        executable_sha256: None,
    })
}

/// Resolve the digest-verified artifact for `repo`@`tag` matching the verified
/// lock's platform artifact `lock_name`. Clear refusals, never a blind install.
pub fn resolve_artifact(repo: &str, tag: &str, lock_name: &str) -> AppResult<Artifact> {
    let release = by_tag(repo, tag)
        .ok_or_else(|| AppError::Storage(format!("Could not fetch release {tag} from github.com/{repo}.")))?;
    let asset = pick_asset(lock_name, &release.assets).ok_or_else(|| {
        AppError::Storage(format!("Release {tag} has no asset matching this platform ({lock_name})."))
    })?;
    artifact_from(asset).ok_or_else(|| {
        AppError::Storage(format!(
            "Release asset {} has no sha256 digest to verify against — refusing an unverified install.",
            asset.name
        ))
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamInfo {
    pub id: String,
    pub tag: String,
}

/// Managed-component id → its id in the CI-generated catalog.json mirror.
const MIRROR_IDS: [(&str, &str); 4] = [
    ("personal", "exasol-personal"),
    ("exapump", "exapump"),
    ("mcp-server", "mcp-server"),
    ("exa-agent", "exa-agent"),
];

/// Upstream tags mined from the catalog.json mirror (whose CI fetches GitHub
/// AUTHENTICATED). Pure so the mapping is unit-tested. Only fills the ids in
/// `missing` — live GitHub answers always win.
fn mirror_upstream(catalog: &Value, missing: &[&str]) -> Vec<UpstreamInfo> {
    missing
        .iter()
        .filter_map(|id| {
            let catalog_id = MIRROR_IDS.iter().find(|(c, _)| c == id)?.1;
            let tag = catalog.get("items")?.get(catalog_id)?.get("latest")?.as_str()?;
            Some(UpstreamInfo { id: (*id).into(), tag: tag.into() })
        })
        .collect()
}

fn fetch_mirror_catalog() -> Option<Value> {
    reqwest::blocking::Client::new()
        .get("https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/marketplace/catalog.json")
        .header("User-Agent", "exasol-studio")
        .timeout(Duration::from_secs(6))
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .ok()
}

/// Latest official release tag per managed component. Live GitHub first; any
/// repo the (unauthenticated, 60/hr rate-limited) API couldn't answer falls
/// back to the CI-generated catalog mirror — so the Updates panel never hides
/// an official release just because the API rate limit is exhausted.
#[tauri::command]
pub async fn components_upstream() -> AppResult<Vec<UpstreamInfo>> {
    tauri::async_runtime::spawn_blocking(|| {
        let lock = crate::component_lock::components();
        let watched: [(&str, String); 4] = [
            ("personal", lock.personal.repository.clone()),
            ("exapump", lock.exapump.repository.clone()),
            ("mcp-server", "exasol/mcp-server".to_string()),
            // The Exa AI engine — the same repo engine.rs installs from.
            ("exa-agent", "Sheetaldharshan200/exa-engine".to_string()),
        ];
        let mut out: Vec<UpstreamInfo> = Vec::new();
        let mut missing: Vec<&str> = Vec::new();
        for (id, repo) in &watched {
            match latest(repo) {
                Some(release) => out.push(UpstreamInfo { id: (*id).into(), tag: release.tag }),
                None => missing.push(id),
            }
        }
        if !missing.is_empty() {
            if let Some(catalog) = fetch_mirror_catalog() {
                out.extend(mirror_upstream(&catalog, &missing));
            }
        }
        out
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))
}


/// A source repository's default branch, fetched fresh and extracted.
///
/// The vendored copies these calls replace were pinned to whatever revision
/// happened to be current when someone last ran the refresh script — the same
/// staleness the release components had. Source components are not couplable
/// to Studio releases either: the original repository is the source of truth,
/// fetched when the component is actually installed.
///
/// Returns the extracted tree and the commit it came from. GitHub encodes the
/// commit in the tarball's root directory name (`owner-repo-<sha>`), so the
/// revision recorded in install manifests is the real one, not "latest".
pub fn fetch_source_tree(repo: &str, destination: &std::path::Path) -> AppResult<(std::path::PathBuf, String)> {
    let bytes = fetch_source_tarball(repo)?;

    let _ = std::fs::remove_dir_all(destination);
    std::fs::create_dir_all(destination)?;
    let decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
    tar::Archive::new(decoder)
        .unpack(destination)
        .map_err(|e| AppError::Storage(format!("could not extract {repo} archive: {e}")))?;

    // The tarball has a single root: owner-repo-<sha>.
    let root = std::fs::read_dir(destination)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| path.is_dir())
        .ok_or_else(|| AppError::Storage(format!("{repo} archive was empty")))?;
    // Normalized to the short form so the API path (7-char sha in the root
    // name) and the codeload path (full sha) record the same revision for
    // the same commit — otherwise readiness markers would churn.
    let revision: String = root
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.rsplit('-').next())
        .unwrap_or("unknown")
        .chars()
        .take(7)
        .collect();
    Ok((root, revision))
}

/// Download the repo tarball. The GitHub API endpoint counts against the
/// unauthenticated per-IP rate limit — permanently exhausted on shared
/// corporate NATs — so on failure fall back to codeload.github.com (not
/// rate-limited), resolving the default branch's commit from the repo's
/// commits atom feed (also not rate-limited).
fn fetch_source_tarball(repo: &str) -> AppResult<Vec<u8>> {
    let client = reqwest::blocking::Client::new();
    let api = client
        .get(format!("https://api.github.com/repos/{repo}/tarball"))
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(120))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.bytes());
    let api_err = match api {
        Ok(bytes) => return Ok(bytes.to_vec()),
        Err(e) => e,
    };

    let atom = client
        .get(format!("https://github.com/{repo}/commits/HEAD.atom"))
        .header("User-Agent", "exasol-studio")
        .timeout(Duration::from_secs(60))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| AppError::Storage(format!("could not fetch {repo}: {api_err}; commits feed also failed: {e}")))?;
    let reference = sha_from_commits_atom(&atom).unwrap_or_else(|| "refs/heads/main".to_string());

    client
        .get(format!("https://codeload.github.com/{repo}/tar.gz/{reference}"))
        .header("User-Agent", "exasol-studio")
        .timeout(Duration::from_secs(120))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.bytes())
        .map(|b| b.to_vec())
        .map_err(|e| AppError::Storage(format!("could not fetch {repo}: {api_err}; codeload fallback also failed: {e}")))
}

/// First commit sha in a GitHub commits atom feed (`…/commit/<40 hex>`).
pub(crate) fn sha_from_commits_atom(atom: &str) -> Option<String> {
    let marker = "/commit/";
    let start = atom.find(marker)? + marker.len();
    let sha: String = atom[start..].chars().take_while(|c| c.is_ascii_hexdigit()).collect();
    if sha.len() == 40 { Some(sha) } else { None }
}

#[cfg(test)]
mod tests {
    use super::{classify_failure, parse_atom_tag, parse_expanded_assets, ReleaseError};

    #[test]
    fn the_newest_tag_comes_off_the_atom_feed() {
        // The feed is newest-first, and an entry id is
        // tag:github.com,2008:Repository/<repo id>/<tag>.
        let xml = "<feed><entry><id>tag:github.com,2008:Repository/305597227/4.0.2</id></entry>\
                   <entry><id>tag:github.com,2008:Repository/305597227/4.0.1</id></entry></feed>";
        assert_eq!(parse_atom_tag(xml).as_deref(), Some("4.0.2"));
    }

    #[test]
    fn a_tag_with_a_v_prefix_or_dots_survives_intact() {
        let one = |t: &str| format!("<id>tag:github.com,2008:Repository/1/{t}</id>");
        assert_eq!(parse_atom_tag(&one("v0.1.1")).as_deref(), Some("v0.1.1"));
        assert_eq!(parse_atom_tag(&one("2026.10.0")).as_deref(), Some("2026.10.0"));
    }

    #[test]
    fn a_feed_with_no_releases_yields_no_tag() {
        assert_eq!(parse_atom_tag("<feed></feed>"), None);
        assert_eq!(parse_atom_tag(""), None);
    }

    #[test]
    fn asset_names_come_off_the_release_fragment_without_duplicates() {
        // GitHub links each asset twice in that fragment (name and icon).
        let html = r#"<a href="/exasol/postgresql-virtual-schema/releases/download/4.0.2/virtual-schema-dist-14.0.5-postgresql-4.0.2.jar">x</a>
                      <a href="/exasol/postgresql-virtual-schema/releases/download/4.0.2/virtual-schema-dist-14.0.5-postgresql-4.0.2.jar">y</a>
                      <a href="/exasol/postgresql-virtual-schema/releases/download/4.0.2/error_code_report.json">z</a>"#;
        assert_eq!(
            parse_expanded_assets(html, "4.0.2"),
            ["virtual-schema-dist-14.0.5-postgresql-4.0.2.jar", "error_code_report.json"]
        );
    }

    #[test]
    fn a_release_with_no_assets_yields_none() {
        assert!(parse_expanded_assets("<div>no downloads</div>", "1.0.0").is_empty());
    }

    #[test]
    fn only_this_tags_assets_are_taken() {
        let html = r#"<a href="/o/r/releases/download/1.0.0/old.jar"></a>
                      <a href="/o/r/releases/download/2.0.0/new.jar"></a>"#;
        assert_eq!(parse_expanded_assets(html, "2.0.0"), ["new.jar"]);
    }

    #[test]
    fn a_spent_rate_limit_is_named_as_one_with_its_reset() {
        // The failure every virtual schema hits at the same moment. Reporting
        // it as "could not read the release" sent people looking for a broken
        // repository instead of a clock.
        let e = classify_failure(403, Some("0"), Some("1000"), 700);
        assert_eq!(e, ReleaseError::RateLimited { resets_in_secs: Some(300) });
        assert!(e.to_string().contains("5 minute"));
        assert!(e.to_string().contains("60 requests an hour"));
    }

    #[test]
    fn a_429_with_the_allowance_gone_is_also_a_rate_limit() {
        assert_eq!(
            classify_failure(429, Some("0"), None, 0),
            ReleaseError::RateLimited { resets_in_secs: None }
        );
    }

    #[test]
    fn a_403_with_requests_left_is_not_a_rate_limit() {
        // Private, blocked or otherwise forbidden — saying "rate limit" there
        // would send someone off to wait for nothing.
        assert_eq!(classify_failure(403, Some("57"), None, 0), ReleaseError::Unavailable("HTTP 403".into()));
        assert_eq!(classify_failure(403, None, None, 0), ReleaseError::Unavailable("HTTP 403".into()));
    }

    #[test]
    fn a_missing_release_says_so() {
        assert_eq!(classify_failure(404, Some("59"), None, 0), ReleaseError::NotFound);
        assert!(classify_failure(404, None, None, 0).to_string().contains("never published"));
    }

    #[test]
    fn a_reset_already_past_reads_as_zero_rather_than_underflowing() {
        assert_eq!(
            classify_failure(403, Some("0"), Some("100"), 500),
            ReleaseError::RateLimited { resets_in_secs: Some(0) }
        );
    }

    use super::*;

    #[test]
    fn commits_atom_sha_extraction() {
        let atom = r#"<feed><entry><id>tag:github.com,2008:Grit::Commit/85b87ce49dbc0deadbeef0123456789abcdef012</id><link href="https://github.com/o/r/commit/85b87ce49dbc0deadbeef0123456789abcdef012"/></entry></feed>"#;
        assert_eq!(
            sha_from_commits_atom(atom).as_deref(),
            Some("85b87ce49dbc0deadbeef0123456789abcdef012")
        );
        assert_eq!(sha_from_commits_atom("<feed></feed>"), None);
        assert_eq!(sha_from_commits_atom("/commit/1234"), None); // too short
    }

    fn asset(name: &str, digest: Option<&str>) -> UpstreamAsset {
        UpstreamAsset {
            name: name.into(),
            url: format!("https://example.com/{name}"),
            digest: digest.map(str::to_string),
        }
    }

    #[test]
    fn pick_asset_matches_the_platform_by_stable_suffix() {
        // exapump: version embedded mid-name, platform suffix stable.
        let assets = vec![
            asset("exapump-0.12.0-linux-aarch64", None),
            asset("exapump-0.12.0-macos-aarch64", None),
            asset("exapump-0.12.0-macos-x86_64", None),
            asset("third-party-licenses.txt", None),
        ];
        let picked = pick_asset("exapump-0.11.2-macos-aarch64", &assets).unwrap();
        assert_eq!(picked.name, "exapump-0.12.0-macos-aarch64");

        // exasol-personal: version-free names — exact match wins outright.
        let assets = vec![
            asset("exasol-personal_Linux_arm64.tar.gz", None),
            asset("exasol-personal_macOS_arm64.tar.gz", None),
            asset("exasol-personal_2.2.0_checksums.txt", None),
        ];
        let picked = pick_asset("exasol-personal_macOS_arm64.tar.gz", &assets).unwrap();
        assert_eq!(picked.name, "exasol-personal_macOS_arm64.tar.gz");
    }

    #[test]
    fn pick_asset_refuses_when_no_suffix_is_meaningful() {
        // Only a shared ".txt"/".gz" tail — too weak to identify a platform.
        let assets = vec![asset("notes.txt", None), asset("data.gz", None)];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &[]).is_none());
    }

    #[test]
    fn pick_asset_never_falls_back_to_another_os() {
        // The right platform asset is MISSING: "-aarch64" alone (8 chars)
        // must not match the linux build for a macos lock name.
        let assets = vec![
            asset("exapump-0.12.0-linux-aarch64", None),
            asset("exapump-0.12.0-windows-x86_64.exe", None),
        ];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
    }

    #[test]
    fn pick_asset_refuses_ambiguous_ties() {
        let assets = vec![
            asset("a-macos-aarch64", None),
            asset("b-macos-aarch64", None),
        ];
        assert!(pick_asset("exapump-0.11.2-macos-aarch64", &assets).is_none());
    }

    #[test]
    fn artifact_from_requires_a_real_sha256_digest() {
        let sha = "a".repeat(64);
        let good = asset("exapump-0.12.0-macos-aarch64", Some(&format!("sha256:{sha}")));
        let art = artifact_from(&good).unwrap();
        assert_eq!(art.sha256, sha);
        assert!(art.executable_sha256.is_none());

        // Missing, wrong-algorithm, truncated, and non-hex digests all refuse.
        assert!(artifact_from(&asset("x", None)).is_none());
        assert!(artifact_from(&asset("x", Some("md5:abcd"))).is_none());
        assert!(artifact_from(&asset("x", Some("sha256:abcd"))).is_none());
        let bad_hex = format!("sha256:{}", "z".repeat(64));
        assert!(artifact_from(&asset("x", Some(&bad_hex))).is_none());
    }

    #[test]
    fn mirror_upstream_fills_only_missing_ids_and_maps_catalog_names() {
        let catalog: Value = serde_json::json!({
            "items": {
                "exasol-personal": { "latest": "v2.3.0" },
                "exapump": { "latest": "v0.13.0" },
                "mcp-server": { "latest": "2.2.0" }
            }
        });
        // Only mcp-server was rate-limited → only it comes from the mirror.
        let filled = mirror_upstream(&catalog, &["mcp-server"]);
        assert_eq!(filled.len(), 1);
        assert_eq!(filled[0].id, "mcp-server");
        assert_eq!(filled[0].tag, "2.2.0");
        // "personal" maps to the catalog's "exasol-personal" entry.
        let filled = mirror_upstream(&catalog, &["personal", "exapump"]);
        assert_eq!(filled.iter().map(|u| u.tag.as_str()).collect::<Vec<_>>(), ["v2.3.0", "v0.13.0"]);
    }

    #[test]
    fn mirror_upstream_tolerates_null_and_absent_entries() {
        let catalog: Value = serde_json::json!({ "items": { "mcp-server": { "latest": null } } });
        assert!(mirror_upstream(&catalog, &["mcp-server", "personal"]).is_empty());
        assert!(mirror_upstream(&serde_json::json!({}), &["mcp-server"]).is_empty());
        // Unknown component ids are simply skipped, never invented.
        assert!(mirror_upstream(&catalog, &["nope"]).is_empty());
    }

    #[test]
    fn artifact_from_normalizes_digest_case() {
        let upper = format!("sha256:{}", "AB".repeat(32));
        let art = artifact_from(&asset("x", Some(&upper))).unwrap();
        assert_eq!(art.sha256, "ab".repeat(32));
    }
}
