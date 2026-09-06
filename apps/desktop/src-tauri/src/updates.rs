//! Component update check at APP OPEN: once, shortly after launch, compare the
//! installed component versions against the OFFICIAL GitHub releases and push
//! an in-app notification when something newer exists. No background polling —
//! updates are fetched only when the app opens and when the Updates/catalog
//! tabs are clicked (user rule). Watch only — nothing is ever auto-updated;
//! the notification deep-links to Marketplace → Updates, where the official
//! release installs directly (digest-verified, revertible to the verified
//! baseline) — independent of Studio releases.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(45);

fn latest_release_tag(repo: &str) -> Option<String> {
    let response = reqwest::blocking::Client::new()
        .get(format!("https://api.github.com/repos/{repo}/releases/latest"))
        .header("User-Agent", "exasol-studio")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let body: Value = response.json().ok()?;
    body.get("tag_name")?.as_str().map(str::to_string)
}

/// Numeric-segment comparison ("v2.1.10" > "2.1.9"); non-numeric tags only
/// report on plain inequality.
fn is_newer(remote: &str, local: &str) -> bool {
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
        let remote_segment = remote_parts.get(i).copied().flatten().unwrap_or(0);
        let local_segment = local_parts.get(i).copied().flatten().unwrap_or(0);
        if remote_segment != local_segment {
            return remote_segment > local_segment;
        }
    }
    false
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    // `go` makes the notification clickable: it navigates to the Marketplace's
    // Updates section, where the new version can be installed.
    let _ = app.emit(
        "studio:notice",
        json!({ "kind": "info", "title": title, "body": body, "go": "marketplace:updates" }),
    );
}

fn check_once(app: &AppHandle, already_notified: &mut HashSet<String>) {
    use tauri::Manager;
    let lock = crate::component_lock::components();
    let data_dir = app.state::<crate::state::AppState>().data_dir.clone();
    // Compare against what is ACTUALLY INSTALLED — an independent update past
    // the pin must not keep notifying about a version the user already runs.
    let installed_or = |id: crate::components_update::ComponentId, pin: &str| -> String {
        crate::components_update::read_manifest(&data_dir, id)
            .map(|m| m.version)
            .unwrap_or_else(|| pin.to_string())
    };
    let personal = crate::local_runtime::installed_personal_version(app)
        .unwrap_or_else(|| lock.personal.version.clone());
    let exapump = installed_or(crate::components_update::ComponentId::ExaPump, &lock.exapump.version);
    let mcp = installed_or(crate::components_update::ComponentId::McpServer, &lock.python_stack.mcp_server_version);
    let watched: [(&str, &str, &str); 3] = [
        ("Exasol Personal", &lock.personal.repository, &personal),
        ("ExaPump", &lock.exapump.repository, &exapump),
        ("Exasol MCP Server", "exasol/mcp-server", &mcp),
    ];
    for (name, repo, installed) in watched {
        let Some(tag) = latest_release_tag(repo) else { continue };
        if is_newer(&tag, installed) && already_notified.insert(format!("{repo}@{tag}")) {
            notify(
                app,
                &format!("{name} {tag} is available"),
                &format!(
                    "You have {installed}. The official release {tag} is out on github.com/{repo} — open Marketplace → Updates to install it now, independent of Studio updates."
                ),
            );
        }
    }
}

/// Spawn the one-shot app-open check. Called once from app setup.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut already_notified: HashSet<String> = HashSet::new();
        std::thread::sleep(FIRST_CHECK_AFTER);
        check_once(&app, &mut already_notified);
    });
}
