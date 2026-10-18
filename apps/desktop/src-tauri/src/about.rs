//! The About dialog's facts and actions: versions and the system, the logs
//! folder, and a diagnostics text to paste into a bug report. Nothing secret
//! goes into it: no connection details, no passwords.

use serde::Serialize;
use tauri::Manager;

use crate::error::{AppError, AppResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutInfo {
    pub app_version: String,
    pub tauri_version: String,
    pub os: String,
    pub arch: String,
    pub data_dir: String,
    pub logs_dir: String,
}

fn logs_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.state::<crate::state::AppState>().data_dir.join("logs")
}

#[tauri::command]
pub fn about_info(app: tauri::AppHandle) -> AboutInfo {
    AboutInfo {
        app_version: app.package_info().version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        os: format!("{} {}", std::env::consts::OS, os_version()),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: app.state::<crate::state::AppState>().data_dir.to_string_lossy().into_owned(),
        logs_dir: logs_dir(&app).to_string_lossy().into_owned(),
    }
}

fn os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("sw_vers").arg("-productVersion").output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    String::new()
}

/// Open the logs folder in the file manager (created if missing).
#[tauri::command]
pub fn open_logs_dir(app: tauri::AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = logs_dir(&app);
    std::fs::create_dir_all(&dir)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| AppError::Storage(e.to_string()))
}

/// The last `lines` lines of the app's webview log, for diagnostics.
#[tauri::command]
pub fn recent_log(app: tauri::AppHandle, lines: Option<usize>) -> String {
    let text = std::fs::read_to_string(logs_dir(&app).join("webview.log")).unwrap_or_default();
    tail(&text, lines.unwrap_or(40).min(500))
}

fn tail(text: &str, n: usize) -> String {
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(n)..].join("\n")
}

#[cfg(test)]
mod tests {
    #[test]
    fn tail_keeps_the_last_lines() {
        assert_eq!(super::tail("a\nb\nc", 2), "b\nc");
        assert_eq!(super::tail("a", 5), "a");
        assert_eq!(super::tail("", 3), "");
        assert_eq!(super::tail("a\nb", 0), "");
    }
}
