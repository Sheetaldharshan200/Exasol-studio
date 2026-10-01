//! Export and import connections as a JSON file. Passwords and tokens never
//! leave: the export has none, and imported connections ask on first connect.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::profiles::ConnectionProfile;
use crate::state::AppState;

const FORMAT: &str = "exasol-studio-connections";
const VERSION: u64 = 1;

/// The settings a connections file carries: everything except SQL that runs
/// on its own — connect/disconnect hooks and the keep-alive statement. Such
/// SQL may hold secrets, and a file from someone else must not run SQL under
/// the importer's login without review.
pub fn portable_settings(settings: &Value) -> Value {
    let mut v = settings.clone();
    if let Some(o) = v.as_object_mut() {
        o.remove("hooks");
        if let Some(p) = o.get_mut("physical").and_then(Value::as_object_mut) {
            p.remove("validationSql");
        }
    }
    v
}

/// The export document: every profile without its secret, with its settings.
pub fn build_export(profiles: &[(ConnectionProfile, Value)]) -> Value {
    let connections: Vec<Value> = profiles
        .iter()
        .map(|(p, settings)| {
            let mut p = p.clone();
            if let Some(n) = &mut p.network {
                crate::network::redact(n);
            }
            let mut v = serde_json::to_value(&p).unwrap_or(Value::Null);
            if let Some(o) = v.as_object_mut() {
                for k in ["id", "password", "createdAt", "lastUsedAt"] {
                    o.remove(k);
                }
                if !settings.is_null() {
                    o.insert("settings".into(), portable_settings(settings));
                }
            }
            v
        })
        .collect();
    json!({ "format": FORMAT, "version": VERSION, "connections": connections })
}

/// The connections in an export document, each with its settings; a secret
/// in the file is ignored. Errors name what is wrong with the file.
pub fn parse_import(text: &str) -> AppResult<Vec<(ConnectionProfile, Value)>> {
    let bad = |m: &str| AppError::InvalidSettings(m.to_string());
    let doc: Value = serde_json::from_str(text).map_err(|_| bad("This file is not JSON."))?;
    if doc.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(bad("This is not an Exasol Studio connections file."));
    }
    if doc.get("version").and_then(Value::as_u64).is_none_or(|v| v > VERSION) {
        return Err(bad("This connections file is from a newer Exasol Studio; update Studio to import it."));
    }
    let list = doc.get("connections").and_then(Value::as_array).ok_or_else(|| bad("The file lists no connections."))?;
    list.iter()
        .enumerate()
        .map(|(i, c)| {
            let mut c = c.clone();
            let settings = c.as_object_mut().and_then(|o| o.remove("settings")).map(|s| portable_settings(&s)).unwrap_or(Value::Null);
            if let Some(o) = c.as_object_mut() {
                o.insert("id".into(), json!(""));
                o.insert("password".into(), json!(""));
            }
            let mut p: ConnectionProfile = serde_json::from_value(c).map_err(|e| bad(&format!("Connection {} is incomplete: {e}", i + 1)))?;
            if let Some(n) = &mut p.network {
                crate::network::redact(n);
            }
            Ok((p, settings))
        })
        .collect()
}

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: Vec<String>,
    /// Already there (same name, address and user): left as they are.
    pub skipped: Vec<String>,
    /// Not imported, with the reason.
    pub failed: Vec<String>,
}

/// Save a file of all connections, chosen in the system dialog. The path, or
/// None when cancelled.
#[tauri::command]
pub async fn export_connections(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let entries: Vec<(ConnectionProfile, Value)> = crate::profiles::load_profiles(&state)?
        .into_iter()
        .map(|p| {
            let settings = crate::connection_settings::read_settings(&state, &p.id);
            (p, settings)
        })
        .collect();
    let text = serde_json::to_string_pretty(&build_export(&entries))?;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_file_name("exasol-connections.json").add_filter("JSON", &["json"]).blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    std::fs::write(&path, text)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Import a connections file chosen in the system dialog. None when cancelled.
#[tauri::command]
pub async fn import_connections(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<ImportReport>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file())
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    if std::fs::metadata(&path)?.len() > 4_000_000 {
        return Err(AppError::InvalidSettings("This file is too large to be a connections file.".into()));
    }
    let entries = parse_import(&std::fs::read_to_string(&path)?)?;
    let existing = crate::profiles::load_profiles(&state)?;
    let mut report = ImportReport::default();
    for (profile, settings) in entries {
        let name = profile.name.clone();
        if existing.iter().any(|p| crate::profile_check::same_connection(p, &profile)) {
            report.skipped.push(name);
            continue;
        }
        match crate::profiles::save_profile(&state, profile) {
            Ok(saved) => {
                if !settings.is_null() {
                    let _ = crate::connection_settings::write_settings(&state, &saved.id, settings);
                }
                report.added.push(saved.name);
            }
            Err(e) => report.failed.push(format!("{name}: {e}")),
        }
    }
    Ok(Some(report))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(name: &str) -> ConnectionProfile {
        serde_json::from_value(json!({
            "id": "p1", "name": name, "host": "db.example.com", "port": 8563, "username": "sys",
            "password": "sealed:secret", "sslMode": "verify_identity", "driverId": "sqlx-exasol",
            "fingerprint": "AB".repeat(32), "createdAt": "2026-01-01"
        }))
        .unwrap()
    }

    #[test]
    fn an_export_carries_no_secret_and_round_trips() {
        let doc = build_export(&[(profile("Prod"), json!({ "transaction": { "autoCommit": false } }))]);
        let text = doc.to_string();
        assert!(!text.contains("secret") && !text.contains("\"password\":"), "no password field at all: {text}");
        assert!(!text.contains("\"id\""));
        let back = parse_import(&text).unwrap();
        assert_eq!(back.len(), 1);
        let (p, settings) = &back[0];
        assert_eq!((p.name.as_str(), p.host.as_str(), p.port), ("Prod", "db.example.com", 8563));
        assert_eq!(p.fingerprint.as_deref(), Some("AB".repeat(32).as_str()), "the pin travels");
        assert!(p.id.is_empty() && p.password.is_empty());
        assert_eq!(settings["transaction"]["autoCommit"], json!(false));
    }

    #[test]
    fn sql_that_runs_on_its_own_never_travels_in_the_file() {
        let settings = json!({
            "hooks": { "connectEnabled": true, "connectSql": "GRANT DBA TO attacker" },
            "physical": { "keepAlive": true, "validationSql": "DROP TABLE t", "idleSeconds": 60 },
            "color": { "accent": "#e11d48" }
        });
        let text = build_export(&[(profile("P"), settings.clone())]).to_string();
        assert!(!text.contains("GRANT") && !text.contains("DROP"), "{text}");
        assert!(text.contains("#e11d48") && text.contains("idleSeconds"));
        // A hand-made file with hooks: they are dropped on import too.
        let doc = json!({ "format": FORMAT, "version": 1, "connections": [
            { "name": "X", "host": "h", "port": 8563, "username": "u", "settings": settings }
        ]});
        let (_, imported) = parse_import(&doc.to_string()).unwrap().remove(0);
        assert!(imported.get("hooks").is_none());
        assert!(imported["physical"].get("validationSql").is_none());
        assert_eq!(imported["physical"]["keepAlive"], json!(true));
    }

    #[test]
    fn network_secrets_never_travel_in_the_file() {
        let mut p = profile("P");
        p.network = Some(crate::network::NetworkSettings {
            ssh: Some(crate::network::SshSettings {
                host: "bastion".into(), port: None, user: Some("ops".into()), auth: "password".into(), key_path: None,
                jump: None, host_key: "ask".into(), keepalive_secs: 30, secret: "v1:sealed-ssh".into(),
            }),
            proxy: None,
        });
        let text = build_export(&[(p, Value::Null)]).to_string();
        assert!(!text.contains("sealed-ssh"), "{text}");
        assert!(text.contains("bastion"), "the tunnel settings travel");
        let (back, _) = parse_import(&text).unwrap().remove(0);
        assert_eq!(back.network.unwrap().ssh.unwrap().secret, "");
    }

    #[test]
    fn a_password_in_an_imported_file_is_ignored() {
        let text = json!({ "format": FORMAT, "version": 1, "connections": [
            { "name": "X", "host": "h", "port": 8563, "username": "u", "password": "hunter2" }
        ]})
        .to_string();
        let (p, settings) = parse_import(&text).unwrap().remove(0);
        assert_eq!(p.password, "");
        assert!(settings.is_null());
        assert_eq!(p.auth_method, "password", "defaults fill what the file leaves out");
    }

    #[test]
    fn a_wrong_file_says_what_is_wrong() {
        let msg = |t: &str| parse_import(t).unwrap_err().to_string();
        assert!(msg("not json").contains("not JSON"));
        assert!(msg(r#"{"format":"other","version":1,"connections":[]}"#).contains("not an Exasol Studio"));
        assert!(msg(r#"{"format":"exasol-studio-connections","version":9,"connections":[]}"#).contains("newer"));
        assert!(msg(r#"{"format":"exasol-studio-connections","version":1}"#).contains("no connections"));
        assert!(msg(r#"{"format":"exasol-studio-connections","version":1,"connections":[{"name":"x"}]}"#).contains("Connection 1 is incomplete"));
        assert_eq!(parse_import(r#"{"format":"exasol-studio-connections","version":1,"connections":[]}"#).unwrap().len(), 0);
    }
}
