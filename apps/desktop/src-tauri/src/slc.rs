//! Script language containers for the managed local database, through the
//! official Exasol launcher — which owns them: `exasol slc install|remove`
//! fetch, register and drop a container, `slc list --json` says what is
//! offered and installed. Studio wraps exactly that and adds nothing.

use crate::error::{AppError, AppResult};
use crate::market::{emit_log, run_streamed};
use serde_json::Value;
use std::process::Command;
use tauri::AppHandle;

/// The launcher and deployment a language container goes into. Containers
/// live in the managed local Exasol Personal; the launcher owns them.
fn slc_launcher(app: &AppHandle) -> AppResult<(String, String)> {
    let cli = crate::local_runtime::exasol_cli(app)?;
    let dep = crate::local_runtime::personal_deployment_dir(app)?;
    if !dep.is_dir() {
        return Err(AppError::Storage(
            "Set up the local database first — language containers are installed into Studio's managed Exasol Personal.".into(),
        ));
    }
    Ok((cli.to_string_lossy().into_owned(), dep.to_string_lossy().into_owned()))
}

/// `exasol slc install <alias>`: the launcher downloads the official container
/// for this machine, registers the alias and restarts the local database.
pub(crate) fn install(app: &AppHandle, id: &str, alias: &str, repo: Option<&str>) -> AppResult<(String, String)> {
    if !crate::installers::valid_alias(alias) {
        return Err(AppError::Storage(format!("{alias:?} is not a language alias Studio will pass to the launcher.")));
    }
    let (cli, dep) = slc_launcher(app)?;
    emit_log(
        app,
        id,
        format!("Installing the {alias} language container through the official Exasol launcher — the local database restarts once…"),
        "info",
    );
    let code = run_streamed(app, id, &cli, &["--auto-approve", "slc", "install", alias, "--deployment-dir", &dep])?;
    if code != 0 {
        return Err(AppError::Storage(format!("`exasol slc install {alias}` exited with code {code}. See the log above.")));
    }
    let version = repo.and_then(crate::upstream::latest).map(|r| r.tag).unwrap_or_else(|| "latest".into());
    Ok((
        version,
        format!("{} language container installed in the local database — UDFs in that language run now.", alias.to_ascii_uppercase()),
    ))
}

/// `exasol slc remove <alias>`: the launcher drops the alias and the container.
pub(crate) fn remove(app: &AppHandle, id: &str, alias: &str) -> AppResult<()> {
    if !crate::installers::valid_alias(alias) {
        return Err(AppError::Storage(format!("{alias:?} is not a language alias Studio will pass to the launcher.")));
    }
    let (cli, dep) = slc_launcher(app)?;
    emit_log(app, id, format!("Removing the {alias} language container through the official Exasol launcher…"), "info");
    let code = run_streamed(app, id, &cli, &["--auto-approve", "slc", "remove", alias, "--deployment-dir", &dep])?;
    if code != 0 {
        return Err(AppError::Storage(format!("`exasol slc remove {alias}` exited with code {code}. See the log above.")));
    }
    Ok(())
}

/// One container the launcher offers, and whether it is installed.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlcChoice {
    pub alias: String,
    pub installed: bool,
}

/// Pure: the launcher's `slc list --json` as choices, first alias per container.
pub(crate) fn slc_choices_from(list: &Value) -> Vec<SlcChoice> {
    list.as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|c| {
                    let alias = c.get("aliases")?.as_array()?.first()?.as_str()?.to_ascii_uppercase();
                    Some(SlcChoice { alias, installed: c.get("installed").and_then(Value::as_bool).unwrap_or(false) })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The language containers the official launcher can install into the
/// managed local database, for the variant menu of a container item that
/// names no alias.
#[tauri::command]
pub async fn market_slc_catalog(app: AppHandle) -> AppResult<Vec<SlcChoice>> {
    let (cli, dep) = slc_launcher(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(&cli)
            .args(["slc", "list", "--json", "--deployment-dir", &dep])
            .output()
            .map_err(|e| AppError::Storage(format!("Could not run the Exasol launcher: {e}")))?;
        if !output.status.success() {
            return Err(AppError::Storage(format!(
                "The launcher could not list containers: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
        let list: Value = serde_json::from_slice(&output.stdout)
            .map_err(|_| AppError::Storage("The launcher's container list could not be read.".into()))?;
        Ok(slc_choices_from(&list))
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?
}


#[cfg(test)]
mod tests {
    use super::{slc_choices_from, SlcChoice};
    use serde_json::json;

    #[test]
    fn the_launcher_listing_becomes_choices_by_first_alias() {
        let list = json!([
            { "flavor": "python-3.10", "aliases": ["python3", "PYTHON3_10"], "installed": true },
            { "flavor": "java-17", "aliases": ["java"], "installed": false },
            { "flavor": "broken" },
        ]);
        assert_eq!(
            slc_choices_from(&list),
            vec![
                SlcChoice { alias: "PYTHON3".into(), installed: true },
                SlcChoice { alias: "JAVA".into(), installed: false },
            ]
        );
        assert!(slc_choices_from(&json!({})).is_empty(), "not a list → nothing offered");
    }
}
