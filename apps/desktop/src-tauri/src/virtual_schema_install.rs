//! Stage a virtual schema adapter into Studio's managed local Exasol Personal.
//!
//! Exasol Personal 2.3 exposes the database's `/exa` directory on the host at
//! `<deployment>/local/runtime/exa`, and its guide says to stage adapter files
//! by writing them there: the adapter and driver JARs under
//! `exa/bucketfs/bfsdefault/default/vs/` (which SQL sees as
//! `/buckets/bfsdefault/default/vs/…`), the JDBC driver again under
//! `exa/jdbc/<DRIVERNAME>/` with a `settings.cfg` for the ETL layer, and the
//! Java script language container installed with `exasol slc install java`.
//!
//! This module does exactly that — download, verify what can be verified, copy,
//! install the SLC, restart once — and nothing more. It decides nothing about
//! adapters: the catalog (TypeScript, tested) says which repository, which
//! asset, which driver; the DDL is generated there too and run through the
//! normal execute path. Rust here is file plumbing with a progress log.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::local_runtime::{exasol_cli, personal_deployment_dir, restart_personal_runtime};
use crate::market::{download_only, emit_log, maven_latest_version, run_streamed};

/// Where the guide says the staged files go, relative to `/exa`.
const BUCKET_DIR: &str = "bucketfs/bfsdefault/default";
const VS_DIR: &str = "vs";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRequest {
    /// Job id for the Marketplace-style progress log.
    pub job_id: String,
    /// GitHub repository of the adapter, `owner/name`.
    pub repo: String,
    /// Regex over the release's asset names; exactly one must match.
    pub asset_pattern: String,
    /// `java` adapters ship a JAR that goes to BucketFS; `lua` adapters ship
    /// source that is inlined into the DDL, so it is returned instead of staged.
    pub runtime: String,
    /// JDBC driver, when the adapter has one.
    pub driver: Option<DriverRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverRequest {
    /// `settings.cfg` DRIVERNAME, e.g. `POSTGRESQL`.
    pub name: String,
    /// Maven `group:artifact` to fetch, or …
    pub maven: Option<String>,
    /// … a JAR the user supplied (absolute path on this machine).
    pub user_jar_path: Option<String>,
    /// The full `settings.cfg` text, generated (and tested) on the TS side.
    /// Only its `JAR=` line is filled in here, because the file name is only
    /// known once the driver has been resolved.
    pub settings_cfg_template: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    /// The adapter release that was staged.
    pub release_tag: String,
    /// Asset file name now in `vs/` (Java), or the asset that was downloaded (Lua).
    pub adapter_asset: String,
    /// Lua adapters: the released source, to inline into `CREATE LUA ADAPTER SCRIPT`.
    pub lua_source: Option<String>,
    /// JDBC driver file name now in `vs/` and registered under `jdbc/<NAME>/`.
    pub driver_file: Option<String>,
    /// Whether the Java SLC had to be installed (and the database restarted).
    pub java_slc_installed: bool,
    pub restarted: bool,
}

/// What the managed local deployment already has — the half of the
/// prerequisite probe that lives on disk rather than in the database.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalState {
    /// False when this Studio has no managed local deployment, or it predates
    /// 2.3 (no host-visible `/exa` yet — a restart under the 2.3 launcher adds it).
    pub managed_local: bool,
    /// Paths under the default bucket, relative to it (`vs/foo.jar`).
    pub bucket_files: Vec<String>,
    /// Aliases of the script language containers that are installed.
    pub slc_aliases: Vec<String>,
    /// This machine's address AS THE DATABASE SEES IT. Inside the macOS VM
    /// runtime, `localhost` is the VM, and the host is the guest's gateway
    /// (`192.168.64.1` for a guest at `192.168.64.x`). None when unknown
    /// (Podman runtimes reach the host by other names).
    pub host_address: Option<String>,
}

/// The guest IP the VM init recorded → the host's address on that network
/// (the `.1` of the guest's /24). Pure; None when the file or the IP is absent.
pub(crate) fn host_address_from_init(init_output_json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(init_output_json).ok()?;
    let ip = v.get("ip")?.as_str()?;
    let mut parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 || parts.iter().any(|p| p.parse::<u8>().is_err()) {
        return None;
    }
    parts[3] = "1";
    Some(parts.join("."))
}

fn exa_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let runtime = personal_deployment_dir(app)?.join("local").join("runtime");
    Ok(resolve_exa_dir(&runtime))
}

/// Where the database's `/exa` really is on this host. The 2.3 guide names
/// `local/runtime/exa`, which is what the Podman-based Linux/Windows runtime
/// uses; on macOS the launcher runs a VM and shares the directory as
/// `local/runtime/vm-shared/exa`, leaving `local/runtime/exa` as an empty
/// stub. Writing into the stub is silent and useless — the database never
/// sees the files — so pick the candidate that carries the database's own
/// layout (`bucketfs/`), else the first that exists, else the guide's path.
pub(crate) fn resolve_exa_dir(runtime: &Path) -> PathBuf {
    let candidates = [runtime.join("vm-shared").join("exa"), runtime.join("exa")];
    if let Some(live) = candidates.iter().find(|c| c.join("bucketfs").is_dir()) {
        return live.clone();
    }
    candidates.iter().find(|c| c.is_dir()).cloned().unwrap_or_else(|| runtime.join("exa"))
}

/// Everything under `dir`, as paths relative to it with `/` separators.
fn relative_files(dir: &Path) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(base, &path, out);
            } else if let Ok(rel) = path.strip_prefix(base) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, dir, &mut out);
    out.sort();
    out
}

/// Installed SLC aliases from `exasol slc list --json`.
fn installed_slc_aliases(cli: &Path, deployment: &Path) -> Vec<String> {
    let Ok(output) = Command::new(cli)
        .args(["slc", "list", "--json", "--deployment-dir"])
        .arg(deployment)
        .output()
    else {
        return Vec::new();
    };
    let Ok(list) = serde_json::from_slice::<Value>(&output.stdout) else { return Vec::new() };
    slc_aliases_from(&list)
}

/// Pure: the aliases of installed containers in the launcher's JSON listing.
pub(crate) fn slc_aliases_from(list: &Value) -> Vec<String> {
    list.as_array()
        .map(|items| {
            items
                .iter()
                .filter(|c| c.get("installed").and_then(Value::as_bool).unwrap_or(false))
                .flat_map(|c| {
                    c.get("aliases")
                        .and_then(Value::as_array)
                        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_uppercase)).collect::<Vec<_>>())
                        .unwrap_or_default()
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn vs_local_state(app: AppHandle) -> AppResult<LocalState> {
    let Ok(exa) = exa_dir(&app) else {
        return Ok(LocalState { managed_local: false, bucket_files: vec![], slc_aliases: vec![], host_address: None });
    };
    if !exa.is_dir() {
        return Ok(LocalState { managed_local: false, bucket_files: vec![], slc_aliases: vec![], host_address: None });
    }
    let bucket_files = relative_files(&exa.join(BUCKET_DIR));
    let slc_aliases = match (exasol_cli(&app), personal_deployment_dir(&app)) {
        (Ok(cli), Ok(dep)) => {
            tauri::async_runtime::spawn_blocking(move || installed_slc_aliases(&cli, &dep))
                .await
                .unwrap_or_default()
        }
        _ => Vec::new(),
    };
    // `<runtime>/vm-shared/init/init-output.json` exists only for the VM runtime.
    let host_address = exa
        .parent()
        .map(|shared| shared.join("init").join("init-output.json"))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|json| host_address_from_init(&json));
    Ok(LocalState { managed_local: true, bucket_files, slc_aliases, host_address })
}

/// Pure: the Maven Central URLs for `group:artifact` at `version`.
pub(crate) fn maven_urls(coords: &str, version: &str) -> Option<(String, String, String)> {
    let (group, artifact) = coords.split_once(':')?;
    if group.is_empty() || artifact.is_empty() || version.is_empty() {
        return None;
    }
    let base = format!("https://repo1.maven.org/maven2/{}/{artifact}", group.replace('.', "/"));
    let jar = format!("{artifact}-{version}.jar");
    Some((format!("{base}/maven-metadata.xml"), format!("{base}/{version}/{jar}"), jar))
}

/// Pure: `settings.cfg` with its `JAR=` line pointing at the resolved file.
pub(crate) fn settings_cfg_with_jar(template: &str, jar: &str) -> String {
    let mut lines: Vec<String> = template
        .lines()
        .filter(|l| !l.starts_with("JAR="))
        .map(str::to_string)
        .collect();
    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines.push(format!("JAR={jar}"));
    lines.push(String::new()); // the guide: "with an empty final line"
    lines.join("\n")
}

fn copy_into(src: &Path, dir: &Path, name: &str) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let dest = dir.join(name);
    std::fs::copy(src, &dest).map_err(|e| AppError::Storage(format!("could not place {name}: {e}")))?;
    Ok(dest)
}

#[tauri::command]
pub async fn vs_stage_adapter(app: AppHandle, req: StageRequest) -> AppResult<StageResult> {
    let id = req.job_id.clone();
    // A Lua adapter without a driver writes nothing: its source is returned
    // for inlining, so it can be fetched for ANY Exasol. Everything else
    // lands in the managed deployment's /exa and needs it to exist.
    let writes_files = req.runtime == "java" || req.driver.is_some();
    let exa = match exa_dir(&app) {
        Ok(dir) if dir.join("bucketfs").is_dir() => Some(dir),
        Ok(_) if writes_files => {
            return Err(AppError::Storage(
                "This Studio's local Exasol Personal does not expose its /exa directory yet (no bucketfs/ under \
                 local/runtime/vm-shared/exa or local/runtime/exa). Restart the local database once (Marketplace → \
                 Local Exasol → Stop, Start) so the 2.3 launcher rebuilds it, then try again."
                    .into(),
            ))
        }
        Err(e) if writes_files => return Err(e),
        _ => None,
    };
    let vs_dir = exa.as_ref().map(|e| e.join(BUCKET_DIR).join(VS_DIR));
    if let Some(dir) = &vs_dir {
        std::fs::create_dir_all(dir)?;
    }
    // Only reachable when `writes_files` — the match above guarantees Some.
    let staging = || -> AppResult<(&Path, &Path)> {
        match (&exa, &vs_dir) {
            (Some(e), Some(v)) => Ok((e.as_path(), v.as_path())),
            _ => Err(AppError::Storage("No managed local Exasol Personal to stage files into.".into())),
        }
    };

    // 1. The adapter release.
    emit_log(&app, &id, format!("Resolving the latest {} release…", req.repo), "info");
    let repo = req.repo.clone();
    let release = tauri::async_runtime::spawn_blocking(move || crate::upstream::latest(&repo))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
        .ok_or_else(|| AppError::Storage(format!("Could not read the latest release of {}.", req.repo)))?;
    let pattern = regex::Regex::new(&req.asset_pattern)
        .map_err(|e| AppError::Storage(format!("Bad asset pattern for {}: {e}", req.repo)))?;
    let matches: Vec<_> = release.assets.iter().filter(|a| pattern.is_match(&a.name)).collect();
    let asset = match matches.as_slice() {
        [one] => *one,
        [] => {
            return Err(AppError::Storage(format!(
                "Release {} of {} has no asset matching the adapter pattern — the catalog entry needs updating. Assets: {}",
                release.tag, req.repo,
                release.assets.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", ")
            )))
        }
        many => {
            return Err(AppError::Storage(format!(
                "Release {} of {} has {} assets matching the adapter pattern; expected one.",
                release.tag, req.repo, many.len()
            )))
        }
    };
    emit_log(&app, &id, format!("Downloading {} ({})…", asset.name, release.tag), "info");
    let downloaded = download_only(&app, &id, &asset.url, &asset.name).await?;
    // GitHub publishes a per-asset digest for recent releases; refuse a mismatch.
    if let Some(expected) = asset.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let actual = crate::local_runtime::sha256_file(Path::new(&downloaded))?;
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&downloaded);
            return Err(AppError::Storage(format!("{} failed checksum verification — discarded.", asset.name)));
        }
        emit_log(&app, &id, "Adapter checksum verified against the GitHub release.", "info");
    }

    let mut lua_source = None;
    if req.runtime == "lua" {
        lua_source = Some(std::fs::read_to_string(&downloaded)?);
        emit_log(&app, &id, "Lua adapter: its source is inlined into the adapter script; nothing to stage.", "info");
    } else {
        let (_, vs_dir) = staging()?;
        copy_into(Path::new(&downloaded), vs_dir, &asset.name)?;
        emit_log(&app, &id, format!("Staged /buckets/bfsdefault/default/{VS_DIR}/{}", asset.name), "info");
    }

    // 2. The JDBC driver — into `vs/` for the adapter and `jdbc/<NAME>/` for the ETL layer.
    let mut driver_file = None;
    if let Some(driver) = &req.driver {
        let (local, jar_name) = match (&driver.maven, &driver.user_jar_path) {
            (Some(coords), _) => {
                let (meta_url, _, _) = maven_urls(coords, "0")
                    .ok_or_else(|| AppError::Storage(format!("Bad Maven coordinates: {coords}")))?;
                emit_log(&app, &id, format!("Resolving the latest {coords} from Maven Central…"), "info");
                let xml = reqwest::Client::new()
                    .get(&meta_url)
                    .header("User-Agent", "exasol-studio")
                    .send()
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| AppError::Storage(format!("Maven Central: {e}")))?
                    .text()
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                let version = maven_latest_version(&xml)
                    .ok_or_else(|| AppError::Storage(format!("Could not read the latest version of {coords}.")))?;
                let (_, jar_url, jar) = maven_urls(coords, &version).expect("validated above");
                emit_log(&app, &id, format!("Downloading {jar}…"), "info");
                (download_only(&app, &id, &jar_url, &jar).await?, jar)
            }
            (None, Some(path)) => {
                let p = PathBuf::from(path);
                let name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .ok_or_else(|| AppError::Storage("The driver JAR path has no file name.".into()))?
                    .to_string();
                if !p.is_file() {
                    return Err(AppError::Storage(format!("No file at {path}.")));
                }
                (path.clone(), name)
            }
            (None, None) => {
                return Err(AppError::Storage(format!(
                    "The {} driver is not on Maven Central — supply its JAR (see the adapter's notes).",
                    driver.name
                )))
            }
        };
        let (exa, vs_dir) = staging()?;
        copy_into(Path::new(&local), vs_dir, &jar_name)?;
        let jdbc_dir = exa.join("jdbc").join(&driver.name);
        copy_into(Path::new(&local), &jdbc_dir, &jar_name)?;
        std::fs::write(jdbc_dir.join("settings.cfg"), settings_cfg_with_jar(&driver.settings_cfg_template, &jar_name))?;
        emit_log(&app, &id, format!("Registered the {} driver for IMPORT/EXPORT (jdbc/{}/settings.cfg)", driver.name, driver.name), "info");
        driver_file = Some(jar_name);
    }

    // 3. Java adapters run as Java UDFs: the Java SLC must be installed. A
    //    newly registered driver needs a restart too — the ETL layer reads
    //    jdbc/<NAME>/settings.cfg at start — whatever the adapter's runtime
    //    (the Lua Databricks adapter ships a JDBC driver).
    let mut java_slc_installed = false;
    let mut needs_restart = driver_file.is_some();
    if req.runtime == "java" {
        let cli = exasol_cli(&app)?;
        let deployment = personal_deployment_dir(&app)?;
        let (cli2, dep2) = (cli.clone(), deployment.clone());
        let aliases = tauri::async_runtime::spawn_blocking(move || installed_slc_aliases(&cli2, &dep2))
            .await
            .unwrap_or_default();
        if !aliases.iter().any(|a| a == "JAVA") {
            emit_log(&app, &id, "Installing the Java script language container (runs the adapter)…", "info");
            let cli_s = cli.to_string_lossy().to_string();
            let dep_s = deployment.to_string_lossy().to_string();
            let (app2, id2) = (app.clone(), id.clone());
            let code = tauri::async_runtime::spawn_blocking(move || {
                run_streamed(&app2, &id2, &cli_s, &["--auto-approve", "slc", "install", "java", "--no-restart", "--deployment-dir", &dep_s])
            })
            .await
            .map_err(|e| AppError::Storage(e.to_string()))??;
            if code != 0 {
                return Err(AppError::Storage("Installing the Java script language container failed. See the log.".into()));
            }
            java_slc_installed = true;
            needs_restart = true;
        }
    }
    // One restart applies the container and the driver registration together.
    let mut restarted = false;
    if needs_restart {
        let why = match (java_slc_installed, driver_file.is_some()) {
            (true, true) => "activate the Java runtime and register the driver",
            (true, false) => "activate the Java runtime",
            _ => "register the driver",
        };
        emit_log(&app, &id, format!("Restarting the local database once to {why}…"), "info");
        let (app3, id3) = (app.clone(), id.clone());
        tauri::async_runtime::spawn_blocking(move || restart_personal_runtime(&app3, &id3))
            .await
            .map_err(|e| AppError::Storage(e.to_string()))??;
        restarted = true;
    }

    Ok(StageResult {
        release_tag: release.tag,
        adapter_asset: asset.name.clone(),
        lua_source,
        driver_file,
        java_slc_installed,
        restarted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_address_is_the_guest_networks_gateway() {
        assert_eq!(host_address_from_init(r#"{"ip":"192.168.64.169"}"#), Some("192.168.64.1".into()));
        assert_eq!(host_address_from_init(r#"{"ip":"unknown"}"#), None);
        assert_eq!(host_address_from_init(r#"{}"#), None);
        assert_eq!(host_address_from_init("not json"), None);
    }

    #[test]
    fn exa_dir_prefers_the_candidate_with_the_database_layout() {
        let t = tempfile::tempdir().unwrap();
        let rt = t.path();
        // macOS VM: the guide's path is an empty stub, the share carries bucketfs/.
        std::fs::create_dir_all(rt.join("exa")).unwrap();
        std::fs::create_dir_all(rt.join("vm-shared/exa/bucketfs")).unwrap();
        assert_eq!(resolve_exa_dir(rt), rt.join("vm-shared/exa"));
        // Podman: only the guide's path, with the layout.
        let t2 = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(t2.path().join("exa/bucketfs")).unwrap();
        assert_eq!(resolve_exa_dir(t2.path()), t2.path().join("exa"));
        // Nothing carries the layout yet: the first existing dir, else the guide's path.
        let t3 = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(t3.path().join("exa")).unwrap();
        assert_eq!(resolve_exa_dir(t3.path()), t3.path().join("exa"));
        let t4 = tempfile::tempdir().unwrap();
        assert_eq!(resolve_exa_dir(t4.path()), t4.path().join("exa"));
    }
    use serde_json::json;

    #[test]
    fn maven_coordinates_become_central_urls() {
        let (meta, jar_url, jar) = maven_urls("org.postgresql:postgresql", "42.7.13").unwrap();
        assert_eq!(meta, "https://repo1.maven.org/maven2/org/postgresql/postgresql/maven-metadata.xml");
        assert_eq!(jar_url, "https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.13/postgresql-42.7.13.jar");
        assert_eq!(jar, "postgresql-42.7.13.jar");
        assert!(maven_urls("nogroup", "1").is_none(), "coordinates need group:artifact");
        assert!(maven_urls(":artifact", "1").is_none());
        assert!(maven_urls("g:a", "").is_none());
    }

    #[test]
    fn settings_cfg_gets_the_resolved_jar_and_a_final_newline() {
        let template = "DRIVERNAME=POSTGRESQL\nPREFIX=jdbc:postgresql:\nDRIVERMAIN=org.postgresql.Driver\nFETCHSIZE=100000\nINSERTSIZE=-1\nJAR=placeholder.jar\n";
        let cfg = settings_cfg_with_jar(template, "postgresql-42.7.13.jar");
        assert_eq!(cfg, "DRIVERNAME=POSTGRESQL\nPREFIX=jdbc:postgresql:\nDRIVERMAIN=org.postgresql.Driver\nFETCHSIZE=100000\nINSERTSIZE=-1\nJAR=postgresql-42.7.13.jar\n");
        // A template without a JAR line, or with trailing blank lines, still ends up well-formed.
        assert_eq!(settings_cfg_with_jar("A=1\n\n\n", "x.jar"), "A=1\nJAR=x.jar\n");
    }

    #[test]
    fn only_installed_containers_contribute_aliases_upper_cased() {
        let list = json!([
            {"language": "java", "aliases": ["JAVA", "JAVA17"], "installed": true},
            {"language": "python", "aliases": ["PYTHON3"], "installed": false},
            {"language": "custom", "aliases": ["mypy3"], "installed": true},
            {"language": "broken"}
        ]);
        assert_eq!(slc_aliases_from(&list), vec!["JAVA", "JAVA17", "MYPY3"]);
        assert!(slc_aliases_from(&json!({})).is_empty(), "not a list → nothing installed");
    }

    #[test]
    fn relative_files_walks_recursively_with_forward_slashes() {
        let root = std::env::temp_dir().join(format!("exasol-studio-vs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("vs")).unwrap();
        std::fs::write(root.join("vs").join("a.jar"), b"a").unwrap();
        std::fs::write(root.join("top.txt"), b"t").unwrap();
        let files = relative_files(&root);
        let _ = std::fs::remove_dir_all(&root);
        assert_eq!(files, vec!["top.txt".to_string(), "vs/a.jar".to_string()]);
        assert!(relative_files(Path::new("/definitely/not/here")).is_empty());
    }
}
