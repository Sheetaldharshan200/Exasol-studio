//! Lightweight Git integration for the workspace folder (~/ExasolStudio), so
//! saved SQL scripts can be versioned without leaving the app. Everything is
//! scoped to the workspace directory and shells out to the user's `git`.

use crate::error::{AppError, AppResult};
use crate::market::{augmented_path, resolve_bin};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

fn workspace() -> AppResult<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve home directory.".into()))?;
    let dir = PathBuf::from(home).join("ExasolStudio");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn git_bin() -> String {
    resolve_bin("git")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "git".into())
}

/// Run `git` in the workspace, returning (exit_ok, stdout, stderr).
fn run(args: &[&str]) -> AppResult<(bool, String, String)> {
    let dir = workspace()?;
    let mut cmd = Command::new(git_bin());
    cmd.args(args).current_dir(&dir);
    if std::env::consts::OS != "windows" {
        cmd.env("PATH", augmented_path());
    }
    let out = cmd
        .output()
        .map_err(|e| AppError::Storage(format!("could not run git: {e}")))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    /// Two-letter porcelain code, e.g. " M", "??", "A ".
    pub code: String,
    pub path: String,
    /// Human label: modified / added / deleted / untracked / renamed.
    pub label: String,
    pub staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub has_git: bool,
    pub is_repo: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFile>,
    pub dir: String,
}

fn label_for(code: &str) -> &'static str {
    let c = code.trim();
    match c {
        "??" => "untracked",
        "M" | "MM" | " M" | "M " => "modified",
        "A" | "A " => "added",
        "D" | " D" | "D " => "deleted",
        _ if c.starts_with('R') => "renamed",
        _ if c.starts_with('A') => "added",
        _ if c.starts_with('D') => "deleted",
        _ if c.contains('M') => "modified",
        _ => "changed",
    }
}

/// Current status of the workspace repo.
#[tauri::command]
pub fn git_status() -> AppResult<GitStatus> {
    let dir = workspace()?.to_string_lossy().to_string();
    if resolve_bin("git").is_none() {
        return Ok(GitStatus {
            has_git: false,
            is_repo: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: vec![],
            dir,
        });
    }
    let (is_repo, _, _) = run(&["rev-parse", "--is-inside-work-tree"])?;
    if !is_repo {
        return Ok(GitStatus {
            has_git: true,
            is_repo: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: vec![],
            dir,
        });
    }

    // Porcelain v1 with branch header (`-b`) gives ahead/behind + branch name.
    let (_, stdout, _) = run(&["status", "--porcelain", "-b"])?;
    let mut branch = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut files = Vec::new();
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            // e.g. "main...origin/main [ahead 1, behind 2]" or "main"
            let name = rest.split("...").next().unwrap_or(rest);
            branch = Some(name.trim().to_string());
            if let Some(b) = rest.split_once('[') {
                let bracket = b.1.trim_end_matches(']');
                for part in bracket.split(',') {
                    let p = part.trim();
                    if let Some(n) = p.strip_prefix("ahead ") {
                        ahead = n.trim().parse().unwrap_or(0);
                    } else if let Some(n) = p.strip_prefix("behind ") {
                        behind = n.trim().parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        if line.len() < 3 {
            continue;
        }
        let code = &line[..2];
        let path = line[3..].to_string();
        // In porcelain, the first column is the staged (index) state.
        let staged = !code.starts_with(' ') && code != "??";
        files.push(GitFile {
            code: code.to_string(),
            label: label_for(code).to_string(),
            path,
            staged,
        });
    }

    Ok(GitStatus {
        has_git: true,
        is_repo: true,
        branch,
        ahead,
        behind,
        files,
        dir,
    })
}

/// Initialise a git repo in the workspace (with a starter .gitignore).
#[tauri::command]
pub fn git_init() -> AppResult<()> {
    let (ok, _, err) = run(&["init"])?;
    if !ok {
        return Err(AppError::Storage(format!("git init failed: {err}")));
    }
    // Default the branch name to `main` for consistency (ignore failure on old git).
    let _ = run(&["symbolic-ref", "HEAD", "refs/heads/main"]);
    let gi = workspace()?.join(".gitignore");
    if !gi.exists() {
        let _ = std::fs::write(&gi, "# Exasol Studio workspace\n.DS_Store\n*.tmp\n");
    }
    Ok(())
}

/// Stage everything and commit with the given message.
#[tauri::command]
pub fn git_commit(message: String) -> AppResult<String> {
    let msg = message.trim();
    if msg.is_empty() {
        return Err(AppError::Storage("Commit message is required.".into()));
    }
    let (ok, _, err) = run(&["add", "-A"])?;
    if !ok {
        return Err(AppError::Storage(format!("git add failed: {err}")));
    }
    let (cok, out, cerr) = run(&["commit", "-m", msg])?;
    if !cok {
        let combined = format!("{out}{cerr}");
        // Nothing to commit is a benign, common case — surface it clearly.
        if combined.contains("nothing to commit") {
            return Err(AppError::Storage("Nothing to commit — the working tree is clean.".into()));
        }
        // A fresh repo with no identity configured is the other common snag.
        if combined.contains("Please tell me who you are") || combined.contains("user.email") {
            return Err(AppError::Storage(
                "Git needs an identity. Run: git config --global user.email you@example.com && git config --global user.name \"Your Name\"".into(),
            ));
        }
        return Err(AppError::Storage(format!("git commit failed: {combined}")));
    }
    Ok(out.lines().next().unwrap_or("Committed.").to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub relative: String,
}

/// Recent commit history (most recent first).
#[tauri::command]
pub fn git_log(limit: Option<u32>) -> AppResult<Vec<GitLogEntry>> {
    if resolve_bin("git").is_none() {
        return Ok(vec![]);
    }
    let n = format!("-{}", limit.unwrap_or(30).clamp(1, 200));
    // Unit separator between fields, record separator between commits.
    let (ok, out, _) = run(&["log", &n, "--pretty=format:%h\x1f%s\x1f%an\x1f%cr\x1e"])?;
    if !ok {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for rec in out.split('\x1e') {
        let rec = rec.trim_matches(['\n', '\r']);
        if rec.is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.split('\x1f').collect();
        if f.len() >= 4 {
            entries.push(GitLogEntry {
                hash: f[0].to_string(),
                subject: f[1].to_string(),
                author: f[2].to_string(),
                relative: f[3].to_string(),
            });
        }
    }
    Ok(entries)
}
