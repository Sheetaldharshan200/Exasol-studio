//! Small filesystem helpers invoked from the frontend after a native dialog
//! has produced a user-chosen path (writing via std::fs avoids fs-plugin
//! scope configuration for arbitrary save locations).

use crate::error::{AppError, AppResult};
use base64::Engine;
use tauri::Manager;

/// Write UTF-8 text to an absolute path chosen by the user in a save dialog.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> AppResult<()> {
    let target = std::path::PathBuf::from(&path);
    let home = home_dir();
    let workspace = home.as_ref().map(|h| h.join("ExasolStudio"));
    let approved = approved_paths().lock().map(|s| s.contains(&target)).unwrap_or(false);
    if !write_authorized(&target, workspace.as_deref(), approved) {
        return Err(crate::error::AppError::InvalidSettings(format!(
            "Refusing to write {}: only files in your Studio workspace, files you opened, or a place you picked in a save dialog can be written.",
            target.display()
        )));
    }
    write_checked(&target, &contents, home.as_deref())
}

/// The safety checks every write passes, then the write.
fn write_checked(target: &std::path::Path, contents: &str, home: Option<&std::path::Path>) -> AppResult<()> {
    write_permitted(target, home).map_err(crate::error::AppError::InvalidSettings)?;
    // A symlink — at the file itself or a folder above it — must not lead
    // somewhere the rules forbid.
    if std::fs::symlink_metadata(target).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Err(crate::error::AppError::InvalidSettings(format!("Refusing to write {}: it is a symbolic link.", target.display())));
    }
    if let Some(real_parent) = target.parent().and_then(|p| std::fs::canonicalize(p).ok()) {
        let real = real_parent.join(target.file_name().unwrap_or_default());
        write_permitted(&real, home).map_err(crate::error::AppError::InvalidSettings)?;
    }
    std::fs::write(target, contents)?;
    Ok(())
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(std::path::PathBuf::from)
}

/// Paths the user chose this session — opened, or picked in a save dialog —
/// which the page may therefore write back to.
fn approved_paths() -> &'static std::sync::Mutex<std::collections::HashSet<std::path::PathBuf>> {
    static PATHS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<std::path::PathBuf>>> = std::sync::OnceLock::new();
    PATHS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

/// Record a path the user chose (opened it, or picked it in a dialog).
pub(crate) fn approve_path(path: &std::path::Path) {
    if let Ok(mut set) = approved_paths().lock() {
        set.insert(path.to_path_buf());
    }
}

/// Who may be written: the Studio workspace, or a path the user chose.
pub(crate) fn write_authorized(path: &std::path::Path, workspace: Option<&std::path::Path>, approved: bool) -> bool {
    approved || workspace.is_some_and(|w| path.starts_with(w))
}

/// Show the native save dialog and write there. The dialog runs here, not in
/// the page, so a path only becomes writable because the person picked it.
#[tauri::command]
pub async fn save_text_as(app: tauri::AppHandle, default_name: String, extensions: Vec<String>, contents: String) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let exts: Vec<String> = extensions.into_iter().filter(|e| WRITABLE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str())).collect();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut d = app.dialog().file().set_file_name(&default_name);
        if !exts.is_empty() {
            let refs: Vec<&str> = exts.iter().map(String::as_str).collect();
            d = d.add_filter("Document", &refs);
        }
        d.blocking_save_file()
    })
    .await
    .map_err(|e| crate::error::AppError::Storage(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    write_checked(&path, &contents, home_dir().as_deref())?;
    approve_path(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// File types the page may write: documents and data, never anything a
/// shell, launchd or an app would load and run.
const WRITABLE_EXTENSIONS: &[&str] = &[
    "sql", "txt", "md", "markdown", "html", "htm", "csv", "tsv", "json", "jsonl", "ndjson", "log", "yaml", "yml", "xml",
];

/// Whether the page may write `path`. The page can name any path, so a
/// compromised page must not be able to plant a login item, a shell profile
/// or a key: absolute paths only, no `..`, no hidden folder or file (`~/.ssh`,
/// `~/.zshrc`), nothing under `~/Library` or system folders, text types only.
pub(crate) fn write_permitted(path: &std::path::Path, home: Option<&std::path::Path>) -> Result<(), String> {
    use std::path::Component;
    let shown = path.display();
    if !path.is_absolute() {
        return Err(format!("Refusing to write {shown}: the path is not absolute."));
    }
    for c in path.components() {
        match c {
            Component::ParentDir | Component::CurDir => return Err(format!("Refusing to write {shown}: the path contains `..` or `.`.")),
            Component::Normal(part) if part.to_string_lossy().starts_with('.') => {
                return Err(format!("Refusing to write {shown}: hidden files and folders are off limits."))
            }
            _ => {}
        }
    }
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    if !WRITABLE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Refusing to write {shown}: only text documents ({}) can be saved here.", WRITABLE_EXTENSIONS.join(", ")));
    }
    let lower = path.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
    let system = ["/system/", "/library/", "/usr/", "/bin/", "/sbin/", "/etc/", "/private/etc/", "/private/var/db/", "c:/windows/", "c:/program files"];
    if system.iter().any(|p| lower.starts_with(p)) {
        return Err(format!("Refusing to write {shown}: system folders are off limits."));
    }
    if let Some(home) = home {
        if path.starts_with(home.join("Library")) || path.starts_with(home.join("AppData")) {
            return Err(format!("Refusing to write {shown}: application support folders are off limits."));
        }
    }
    Ok(())
}

/// Append webview log lines to `<data>/logs/webview.log` so frontend errors
/// survive a crash/blank screen (the release webview has no visible console).
/// Rotates at ~2 MB by truncating — a diagnostics tail, not an archive.
#[tauri::command]
pub async fn append_app_log(app: tauri::AppHandle, lines: String) -> AppResult<()> {
    use std::io::Write;
    let dir = app
        .state::<crate::state::AppState>()
        .data_dir
        .join("logs");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("webview.log");
    if std::fs::metadata(&path).map(|m| m.len() > 2_000_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&path)?;
    f.write_all(lines.as_bytes())?;
    Ok(())
}

/// Install the `exa-agent` terminal command: a tiny wrapper in ~/.local/bin
/// that runs the bundled CLI with the bundled Node (system node as fallback).
/// Returns the wrapper path; the UI shows a PATH hint if needed.
#[tauri::command]
pub async fn install_cli(app: tauri::AppHandle) -> AppResult<String> {
    let script = app
        .path()
        .resolve("exa-agent.cjs", tauri::path::BaseDirectory::Resource)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !script.exists() {
        return Err(AppError::Storage(
            "exa-agent.cjs is missing from this build — reinstall Exasol Studio.".into(),
        ));
    }
    let node_rel = if cfg!(windows) { "runtime/node/node.exe" } else { "runtime/node/bin/node" };
    let bundled_node = app
        .path()
        .resolve(node_rel, tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());

    let home = dirs_home().ok_or_else(|| AppError::Storage("cannot resolve home directory".into()))?;
    let bin_dir = home.join(".local").join("bin");
    std::fs::create_dir_all(&bin_dir)?;

    if cfg!(windows) {
        let node = bundled_node
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "node".into());
        let target = bin_dir.join("exa-agent.cmd");
        std::fs::write(
            &target,
            format!("@echo off\r\n\"{}\" \"{}\" %*\r\n", node, script.to_string_lossy()),
        )?;
        Ok(target.to_string_lossy().to_string())
    } else {
        let node = bundled_node
            .map(|p| format!("\"{}\"", p.to_string_lossy()))
            .unwrap_or_else(|| "node".into());
        let target = bin_dir.join("exa-agent");
        std::fs::write(
            &target,
            format!("#!/bin/sh\nexec {} \"{}\" \"$@\"\n", node, script.to_string_lossy()),
        )?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
        }
        // Fresh accounts rarely have ~/.local/bin on PATH — add it to the
        // shell rc files, idempotently, so `exa-agent` works in a new
        // terminal without any manual step.
        ensure_path_line(&home);
        Ok(target.to_string_lossy().to_string())
    }
}

/// Append the ~/.local/bin PATH export to ~/.zshrc (macOS default shell) and
/// ~/.bashrc (only when it already exists), skipping files that mention
/// `.local/bin` already. Best-effort — a failure never blocks the install.
fn ensure_path_line(home: &std::path::Path) {
    const LINE: &str = "\n# Added by Exasol Studio (exa-agent CLI)\nexport PATH=\"$HOME/.local/bin:$PATH\"\n";
    let zshrc = home.join(".zshrc");
    let bashrc = home.join(".bashrc");
    for (rc, always) in [(zshrc, true), (bashrc, false)] {
        let existing = std::fs::read_to_string(&rc).unwrap_or_default();
        if existing.contains(".local/bin") {
            continue;
        }
        if !always && !rc.exists() {
            continue;
        }
        let _ = std::fs::write(&rc, format!("{existing}{LINE}"));
    }
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(Into::into)
}

/// Persist a chat attachment (base64 payload) under the app data dir so it can
/// be opened in a preview tab. Returns the absolute path written.
#[tauri::command]
pub async fn save_attachment(
    app: tauri::AppHandle,
    name: String,
    base64_data: String,
) -> AppResult<String> {
    // Attachments live INSIDE the user workspace (~/ExasolStudio) — the
    // engine runs there, so its file tools and the filesystem MCP (whose
    // allowed roots come from the engine's cwd) can actually read them, and
    // the files show up in the Files activity for the user to verify.
    let _ = app; // AppHandle kept for signature stability
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve home directory.".into()))?;
    let dir = std::path::PathBuf::from(home).join("ExasolStudio").join("attachments");
    std::fs::create_dir_all(&dir)?;
    // Keep the real filename (extension drives the preview) but strip
    // anything path-like so an attachment can never escape the directory.
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe = safe.trim_matches('.').to_string();
    let file = dir.join(if safe.is_empty() { "attachment".into() } else { safe });
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| AppError::Storage(format!("invalid attachment payload: {e}")))?;
    std::fs::write(&file, bytes)?;
    Ok(file.to_string_lossy().to_string())
}

#[cfg(test)]
mod write_guard_tests {
    use super::write_permitted;
    use std::path::Path;

    fn ok(p: &str) -> bool {
        write_permitted(Path::new(p), Some(Path::new("/Users/ada"))).is_ok()
    }

    #[test]
    fn only_the_workspace_or_a_path_the_user_chose_is_writable() {
        use super::write_authorized;
        let ws = Path::new("/Users/ada/ExasolStudio");
        assert!(write_authorized(Path::new("/Users/ada/ExasolStudio/q.sql"), Some(ws), false));
        assert!(!write_authorized(Path::new("/Users/ada/Documents/report.sql"), Some(ws), false), "a page cannot pick any document");
        assert!(write_authorized(Path::new("/Users/ada/Documents/report.sql"), Some(ws), true), "a file the user opened or picked");
        assert!(!write_authorized(Path::new("/Users/ada/ExasolStudioEvil/q.sql"), Some(ws), false), "prefix is by component, not text");
    }

    #[test]
    fn documents_the_user_saves_are_allowed() {
        assert!(ok("/Users/ada/ExasolStudio/queries/sales.sql"));
        assert!(ok("/Users/ada/Desktop/notebook.html"));
        assert!(ok("/Users/ada/Documents/recovery-keys.TXT"));
        assert!(ok("/Volumes/USB/export.csv"));
    }

    #[test]
    fn nothing_that_could_run_or_steal_is_allowed() {
        assert!(!ok("/Users/ada/.zshrc"), "shell profile");
        assert!(!ok("/Users/ada/.ssh/authorized_keys.txt"), "hidden folder");
        assert!(!ok("/Users/ada/Library/LaunchAgents/evil.plist"), "launch agent");
        assert!(!ok("/Users/ada/Library/Notes/x.txt"), "anything under ~/Library");
        assert!(!ok("/Users/ada/ExasolStudio/../.bashrc.sql"), "parent components");
        assert!(!ok("/Users/ada/run.sh"), "not a document type");
        assert!(!ok("/Users/ada/noext"), "no extension");
        assert!(!ok("relative/file.sql"), "relative path");
        assert!(!ok("/etc/hosts.txt"), "system folder");
        assert!(!ok("/Library/LaunchDaemons/x.xml"), "system library");
    }
}
