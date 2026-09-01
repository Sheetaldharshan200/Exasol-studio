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
pub fn git_commit(message: String, stage_all: Option<bool>) -> AppResult<String> {
    let msg = message.trim();
    if msg.is_empty() {
        return Err(AppError::Storage("Commit message is required.".into()));
    }
    // Only stage everything when asked; otherwise commit what's already staged.
    if stage_all.unwrap_or(false) {
        let (ok, _, err) = run(&["add", "-A"])?;
        if !ok {
            return Err(AppError::Storage(format!("git add failed: {err}")));
        }
    }
    let (cok, out, cerr) = run(&["commit", "-m", msg])?;
    if !cok {
        let combined = format!("{out}{cerr}");
        // Nothing to commit is a benign, common case — surface it clearly.
        if combined.contains("nothing to commit") {
            return Err(AppError::Storage("Nothing staged to commit.".into()));
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

// ── Branches ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranches {
    pub current: String,
    pub local: Vec<String>,
    pub remote: Vec<String>,
}

#[tauri::command]
pub fn git_branches() -> AppResult<GitBranches> {
    if resolve_bin("git").is_none() {
        return Ok(GitBranches { current: String::new(), local: vec![], remote: vec![] });
    }
    let (_, cur, _) = run(&["rev-parse", "--abbrev-ref", "HEAD"])?;
    let (_, l, _) = run(&["branch", "--format=%(refname:short)"])?;
    let (_, r, _) = run(&["branch", "-r", "--format=%(refname:short)"])?;
    let split = |s: &str| s.lines().map(|x| x.trim().to_string()).filter(|x| !x.is_empty() && !x.contains("->")).collect::<Vec<_>>();
    Ok(GitBranches { current: cur.trim().to_string(), local: split(&l), remote: split(&r) })
}

#[tauri::command]
pub fn git_checkout(branch: String) -> AppResult<()> {
    let (ok, _, err) = run(&["checkout", &branch])?;
    if !ok {
        return Err(AppError::Storage(format!("git checkout failed: {}", err.trim())));
    }
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(name: String) -> AppResult<()> {
    let n = name.trim();
    if n.is_empty() {
        return Err(AppError::Storage("Branch name is required.".into()));
    }
    let (ok, _, err) = run(&["checkout", "-b", n])?;
    if !ok {
        return Err(AppError::Storage(format!("git branch failed: {}", err.trim())));
    }
    Ok(())
}

// ── Staging & discard ────────────────────────────────────────────────────────

#[tauri::command]
pub fn git_stage(paths: Vec<String>) -> AppResult<()> {
    let mut args = vec!["add", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    let (ok, _, err) = run(&args)?;
    if !ok {
        return Err(AppError::Storage(format!("git add failed: {}", err.trim())));
    }
    Ok(())
}

#[tauri::command]
pub fn git_stage_all() -> AppResult<()> {
    let (ok, _, err) = run(&["add", "-A"])?;
    if !ok {
        return Err(AppError::Storage(format!("git add failed: {}", err.trim())));
    }
    Ok(())
}

#[tauri::command]
pub fn git_unstage(paths: Vec<String>) -> AppResult<()> {
    let mut args = vec!["restore", "--staged", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    let (ok, _, err) = run(&args)?;
    if !ok {
        // Fall back for older git.
        let mut a2 = vec!["reset", "-q", "HEAD", "--"];
        for p in &paths {
            a2.push(p.as_str());
        }
        let (ok2, _, err2) = run(&a2)?;
        if !ok2 {
            return Err(AppError::Storage(format!("git unstage failed: {}", if err2.trim().is_empty() { err.trim() } else { err2.trim() })));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn git_discard(paths: Vec<String>) -> AppResult<()> {
    for p in &paths {
        // Tracked: restore working-tree version. Untracked: remove the file.
        let _ = run(&["restore", "--", p]);
        let (tracked, _, _) = run(&["ls-files", "--error-unmatch", "--", p])?;
        if !tracked {
            let full = workspace()?.join(p);
            let _ = std::fs::remove_file(&full);
        }
    }
    Ok(())
}

// ── Diff ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn git_diff(path: String, staged: bool) -> AppResult<String> {
    let mut args = vec!["diff"];
    if staged {
        args.push("--staged");
    }
    args.push("--");
    args.push(path.as_str());
    let (_, out, _) = run(&args)?;
    if out.trim().is_empty() {
        // Untracked file: show its content as an all-added diff.
        if let Ok(text) = std::fs::read_to_string(workspace()?.join(&path)) {
            let body: String = text.lines().map(|l| format!("+{l}")).collect::<Vec<_>>().join("\n");
            return Ok(format!("@@ new file @@\n{body}"));
        }
    }
    Ok(out)
}

// ── Remote operations ──────────────────────────────────────────────────────────

fn remote_op(args: &[&str], label: &str) -> AppResult<String> {
    let (has_remote, remotes, _) = run(&["remote"])?;
    if !has_remote || remotes.trim().is_empty() {
        return Err(AppError::Storage("No git remote is configured for this workspace.".into()));
    }
    let (ok, out, err) = run(args)?;
    if !ok {
        return Err(AppError::Storage(format!("git {label} failed: {}", err.trim())));
    }
    Ok(if out.trim().is_empty() { err.trim().to_string() } else { out.trim().to_string() })
}

/// Connect (or replace) the workspace repo's `origin` remote — lets the user
/// push their versioned SQL/notebooks to GitHub/GitLab from the Git panel.
#[tauri::command]
pub fn git_set_remote(url: String) -> AppResult<String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::Storage("Enter a repository URL (https://… or git@…).".into()));
    }
    let (_, remotes, _) = run(&["remote"])?;
    let has_origin = remotes.lines().any(|r| r.trim() == "origin");
    let (ok, _, err) = if has_origin {
        run(&["remote", "set-url", "origin", url])?
    } else {
        run(&["remote", "add", "origin", url])?
    };
    if !ok {
        return Err(AppError::Storage(format!("git remote failed: {}", err.trim())));
    }
    Ok(format!("origin → {url}"))
}

#[tauri::command]
pub fn git_fetch() -> AppResult<String> {
    remote_op(&["fetch", "--all", "--prune"], "fetch")
}

#[tauri::command]
pub fn git_pull() -> AppResult<String> {
    remote_op(&["pull", "--ff-only"], "pull")
}

#[tauri::command]
pub fn git_push() -> AppResult<String> {
    // Push, setting upstream if the branch has none yet.
    let (has_remote, remotes, _) = run(&["remote"])?;
    if !has_remote || remotes.trim().is_empty() {
        return Err(AppError::Storage("No git remote is configured for this workspace.".into()));
    }
    let (ok, out, err) = run(&["push"])?;
    if ok {
        return Ok(if out.trim().is_empty() { err.trim().to_string() } else { out.trim().to_string() });
    }
    // No upstream yet → push and set it.
    let (_, cur, _) = run(&["rev-parse", "--abbrev-ref", "HEAD"])?;
    let cur = cur.trim();
    let first = remotes.lines().next().unwrap_or("origin").trim().to_string();
    let (ok2, out2, err2) = run(&["push", "-u", &first, cur])?;
    if !ok2 {
        return Err(AppError::Storage(format!("git push failed: {}", err2.trim())));
    }
    Ok(if out2.trim().is_empty() { err2.trim().to_string() } else { out2.trim().to_string() })
}

// ── Commit graph (the "git map") ───────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short: String,
    pub parents: Vec<String>,
    pub refs: String,
    pub subject: String,
    pub author: String,
    pub relative: String,
}

#[tauri::command]
pub fn git_graph(limit: Option<u32>) -> AppResult<Vec<GitCommit>> {
    if resolve_bin("git").is_none() {
        return Ok(vec![]);
    }
    let n = format!("-{}", limit.unwrap_or(200).clamp(1, 1000));
    let (ok, out, _) = run(&[
        "log",
        "--all",
        "--date-order",
        &n,
        "--pretty=format:%H\x1f%h\x1f%P\x1f%D\x1f%s\x1f%an\x1f%cr\x1e",
    ])?;
    if !ok {
        return Ok(vec![]);
    }
    let mut commits = Vec::new();
    for rec in out.split('\x1e') {
        let rec = rec.trim_matches(['\n', '\r']);
        if rec.is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.split('\x1f').collect();
        if f.len() >= 7 {
            commits.push(GitCommit {
                hash: f[0].to_string(),
                short: f[1].to_string(),
                parents: f[2].split_whitespace().map(|s| s.to_string()).collect(),
                refs: f[3].to_string(),
                subject: f[4].to_string(),
                author: f[5].to_string(),
                relative: f[6].to_string(),
            });
        }
    }
    Ok(commits)
}

// ── Commit history: rich log, details, changed files, per-file diff ──────────
// Ported from GitDesktop (https://github.com/theBGuy/GitDesktop),
// src-tauri/src/git/history.rs and diff.rs. Copyright 2026 theBGuy.
// Licensed under the Apache License, Version 2.0 — see THIRD-PARTY-NOTICES.md.

fn validate_hash(hash: &str) -> AppResult<()> {
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Storage(format!("invalid commit hash: {hash}")));
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub author_email: String,
    /// Committer date, strict ISO 8601 (%cI) — the UI formats it relatively.
    pub date: String,
    pub tags: Vec<String>,
    pub is_merge: bool,
}

/// The `%H%x00%s%x00%an%x00%ae%x00%cI%x00%D%x00%P` log format, one commit per
/// line. Paired with `parse_commit_log` so listings can't drift into reporting
/// empty tags or merge flags.
const LOG_FORMAT: &str = "--format=%H%x00%s%x00%an%x00%ae%x00%cI%x00%D%x00%P";

fn parse_commit_log(text: &str) -> Vec<GitCommitInfo> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split('\0');
            Some(GitCommitInfo {
                hash: parts.next()?.to_string(),
                subject: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                author_email: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                // %D: "HEAD -> main, tag: v1.0, origin/main" — keep the tags.
                tags: parts
                    .next()
                    .unwrap_or("")
                    .split(", ")
                    .filter_map(|d| d.strip_prefix("tag: "))
                    .map(str::to_string)
                    .collect(),
                // %P: space-separated parent hashes.
                is_merge: parts.next().unwrap_or("").split_whitespace().count() > 1,
            })
        })
        .collect()
}

/// Paged commit history. When `search` is set, searches the whole history by
/// commit message (literal, case-insensitive) instead of paging recent commits.
#[tauri::command]
pub fn git_log_rich(
    limit: Option<u32>,
    skip: Option<u32>,
    search: Option<String>,
) -> AppResult<Vec<GitCommitInfo>> {
    if resolve_bin("git").is_none() {
        return Ok(vec![]);
    }
    let (head_exists, _, _) = run(&["rev-parse", "--verify", "--quiet", "HEAD"])?;
    if !head_exists {
        return Ok(vec![]);
    }
    let limit_arg = limit.unwrap_or(100).clamp(1, 500).to_string();
    let skip_arg = skip.unwrap_or(0).to_string();
    let search = search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let mut args: Vec<&str> = vec!["log", "-n", &limit_arg, "--skip", &skip_arg, LOG_FORMAT];
    if let Some(q) = &search {
        // Literal, case-insensitive match against the whole commit message.
        args.extend(["-i", "-F", "--grep", q.as_str()]);
    }
    let (ok, out, _) = run(&args)?;
    if !ok {
        return Ok(vec![]);
    }
    Ok(parse_commit_log(&out))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetails {
    pub hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
}

#[tauri::command]
pub fn git_commit_details(hash: String) -> AppResult<GitCommitDetails> {
    validate_hash(&hash)?;
    // -z terminates the record so the multi-line body (%b) parses unambiguously.
    let (ok, out, err) = run(&[
        "log",
        "-1",
        "-z",
        "--format=%H%x00%s%x00%an%x00%ae%x00%cI%x00%b",
        &hash,
    ])?;
    if !ok {
        return Err(AppError::Storage(format!("git log failed: {}", err.trim())));
    }
    let record = out.trim_end_matches('\0');
    let mut parts = record.splitn(6, '\0');
    let (Some(hash), Some(subject), Some(author), Some(author_email), Some(date)) = (
        parts.next(),
        parts.next(),
        parts.next(),
        parts.next(),
        parts.next(),
    ) else {
        return Err(AppError::Storage("unexpected git log output".into()));
    };
    let body = parts.next().unwrap_or("").trim().to_string();
    Ok(GitCommitDetails {
        hash: hash.to_string(),
        subject: subject.to_string(),
        body,
        author: author.to_string(),
        author_email: author_email.to_string(),
        date: date.to_string(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffStat {
    pub path: String,
    /// For renames: the pre-rename path — the per-file diff needs BOTH
    /// pathspecs, or a pure rename renders as a newly added file.
    pub old_path: Option<String>,
    pub added: u32,
    pub deleted: u32,
    pub is_binary: bool,
}

/// Parse `git … --numstat -z` output.
/// Regular entry: `added\tdeleted\tpath\0`.
/// Rename entry:  `added\tdeleted\t\0oldpath\0newpath\0` (entry reports the new path).
/// Binary files report `-` for both counts.
fn parse_numstat_z(text: &str) -> Vec<GitDiffStat> {
    let mut entries = Vec::new();
    let mut tokens = text.split('\0');
    while let Some(token) = tokens.next() {
        if token.is_empty() {
            continue;
        }
        let mut fields = token.splitn(3, '\t');
        let (Some(added), Some(deleted), Some(path)) =
            (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let is_binary = added == "-";
        let added = added.parse().unwrap_or(0);
        let deleted = deleted.parse().unwrap_or(0);
        let (path, old_path) = if path.is_empty() {
            // rename: old path, then new path — the entry reports the new one.
            let old = tokens.next().unwrap_or("");
            match tokens.next() {
                Some(new_path) if !new_path.is_empty() => {
                    (new_path.to_string(), Some(old.to_string()).filter(|o| !o.is_empty()))
                }
                _ => continue,
            }
        } else {
            (path.to_string(), None)
        };
        entries.push(GitDiffStat {
            path,
            old_path,
            added,
            deleted,
            is_binary,
        });
    }
    entries
}

/// Files changed by a commit. `-m --first-parent` makes merge commits show
/// their diff against the first parent (like GitHub), and `show` handles the
/// root commit by diffing against the empty tree.
#[tauri::command]
pub fn git_commit_files(hash: String) -> AppResult<Vec<GitDiffStat>> {
    validate_hash(&hash)?;
    let (ok, out, err) = run(&[
        "show",
        "-m",
        "--first-parent",
        "--numstat",
        "-z",
        "--format=",
        &hash,
    ])?;
    if !ok {
        return Err(AppError::Storage(format!("git show failed: {}", err.trim())));
    }
    Ok(parse_numstat_z(&out))
}

/// The unified diff one commit introduced to one file (vs its first parent).
/// For renames pass `old_path` too: the diff needs both sides' pathspecs, or a
/// pure rename shows as an added file.
#[tauri::command]
pub fn git_commit_file_diff(hash: String, path: String, old_path: Option<String>) -> AppResult<String> {
    validate_hash(&hash)?;
    if path.is_empty() {
        return Err(AppError::Storage("empty file path".into()));
    }
    // Literal pathspecs: a raw `[slug]`-style path would otherwise glob.
    let spec = format!(":(literal){path}");
    let old_spec = old_path
        .filter(|o| !o.is_empty() && *o != path)
        .map(|o| format!(":(literal){o}"));
    let mut args: Vec<&str> = vec![
        "show",
        "-m",
        "--first-parent",
        "--find-renames",
        "--no-color",
        "--format=",
        &hash,
        "--",
        &spec,
    ];
    if let Some(old) = &old_spec {
        args.push(old.as_str());
    }
    let (ok, out, err) = run(&args)?;
    if !ok {
        return Err(AppError::Storage(format!("git show failed: {}", err.trim())));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numstat_regular_and_binary() {
        let out = "3\t1\tsrc/a.ts\0-\t-\tlogo.png\0";
        let e = parse_numstat_z(out);
        assert_eq!(e.len(), 2);
        assert_eq!((e[0].path.as_str(), e[0].added, e[0].deleted, e[0].is_binary), ("src/a.ts", 3, 1, false));
        assert_eq!((e[1].path.as_str(), e[1].is_binary), ("logo.png", true));
    }

    #[test]
    fn numstat_rename_reports_both_paths() {
        let out = "5\t2\t\0old/name.ts\0new/name.ts\0";
        let e = parse_numstat_z(out);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].path, "new/name.ts");
        assert_eq!(e[0].old_path.as_deref(), Some("old/name.ts"));
        assert_eq!((e[0].added, e[0].deleted), (5, 2));
        // Non-rename entries carry no old path.
        assert_eq!(parse_numstat_z("1\t1\ta.ts\0")[0].old_path, None);
    }

    #[test]
    fn numstat_empty_and_garbage() {
        assert!(parse_numstat_z("").is_empty());
        assert!(parse_numstat_z("nonsense-no-tabs\0").is_empty());
    }

    #[test]
    fn commit_log_parses_tags_and_merge_flag() {
        let line = "abc123\0Fix bug\0Alice\0a@x.io\02026-09-01T10:00:00+02:00\0HEAD -> main, tag: v1.2, origin/main\0p1 p2\n";
        let c = &parse_commit_log(line)[0];
        assert_eq!(c.subject, "Fix bug");
        assert_eq!(c.tags, vec!["v1.2"]);
        assert!(c.is_merge);
    }

    #[test]
    fn commit_log_skips_malformed_lines() {
        assert!(parse_commit_log("only-one-field\n").is_empty());
        let two = parse_commit_log("h\0s\0a\0e\0d\0\0\nh2\0s2\0a2\0e2\0d2\0\0p\n");
        assert_eq!(two.len(), 2);
        assert!(two[0].tags.is_empty());
        assert!(!two[1].is_merge);
    }

    #[test]
    fn hash_validation_rejects_injection() {
        assert!(validate_hash("abc123DEF").is_ok());
        assert!(validate_hash("").is_err());
        assert!(validate_hash("--help").is_err());
        assert!(validate_hash("abc;rm -rf").is_err());
    }
}

// ── Branch management, merge, stash, amend ────────────────────────────────────
// Rounds out the Source Control tab (workflow modeled on GitDesktop,
// github.com/theBGuy/GitDesktop, Apache-2.0 — see THIRD-PARTY-NOTICES.md).

/// Refuse names git would parse as flags or that carry shell-hostile chars.
fn validate_ref_name(name: &str) -> AppResult<()> {
    let n = name.trim();
    if n.is_empty()
        || n.starts_with('-')
        || n.contains(|c: char| c.is_whitespace() || c.is_control())
        || n.contains("..")
    {
        return Err(AppError::Storage(format!("invalid branch name: {name}")));
    }
    Ok(())
}

/// Amend the last commit — reword when a message is given, otherwise fold the
/// staged changes in keeping the old message.
#[tauri::command]
pub fn git_commit_amend(message: Option<String>) -> AppResult<String> {
    let msg = message.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let args: Vec<&str> = match msg {
        Some(m) => vec!["commit", "--amend", "-m", m],
        None => vec!["commit", "--amend", "--no-edit"],
    };
    let (ok, out, err) = run(&args)?;
    if !ok {
        return Err(AppError::Storage(format!("git commit --amend failed: {out}{err}")));
    }
    Ok(out.lines().next().unwrap_or("Amended.").to_string())
}

#[tauri::command]
pub fn git_branch_delete(name: String, force: Option<bool>) -> AppResult<()> {
    validate_ref_name(&name)?;
    let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
    let (ok, out, err) = run(&["branch", flag, &name])?;
    if !ok {
        let combined = format!("{out}{err}");
        if combined.contains("not fully merged") {
            return Err(AppError::Storage(format!(
                "'{name}' has commits that are not merged anywhere else. Delete anyway to drop them."
            )));
        }
        return Err(AppError::Storage(format!("git branch delete failed: {combined}")));
    }
    Ok(())
}

/// Merge `branch` into the current branch. On conflicts the merge is aborted
/// so the working tree never sits in a half-merged state the UI can't show.
#[tauri::command]
pub fn git_merge(branch: String) -> AppResult<String> {
    validate_ref_name(&branch)?;
    let (ok, out, err) = run(&["merge", "--no-edit", &branch])?;
    if !ok {
        let combined = format!("{out}{err}");
        if combined.contains("CONFLICT") || combined.contains("Automatic merge failed") {
            let _ = run(&["merge", "--abort"]);
            return Err(AppError::Storage(format!(
                "Merging '{branch}' conflicts with your branch — the merge was aborted, nothing changed. Resolve by committing your work first or merging the other way."
            )));
        }
        return Err(AppError::Storage(format!("git merge failed: {combined}")));
    }
    Ok(out.lines().next().unwrap_or("Merged.").to_string())
}

#[tauri::command]
pub fn git_stash_list() -> AppResult<Vec<String>> {
    if resolve_bin("git").is_none() {
        return Ok(vec![]);
    }
    let (ok, out, _) = run(&["stash", "list", "--pretty=format:%gs"])?;
    if !ok {
        return Ok(vec![]);
    }
    Ok(out.lines().filter(|l| !l.trim().is_empty()).map(str::to_string).collect())
}

#[tauri::command]
pub fn git_stash_push(message: Option<String>) -> AppResult<String> {
    let msg = message.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let mut args = vec!["stash", "push", "--include-untracked"];
    if let Some(m) = msg {
        args.extend(["-m", m]);
    }
    let (ok, out, err) = run(&args)?;
    if !ok {
        return Err(AppError::Storage(format!("git stash failed: {out}{err}")));
    }
    if out.contains("No local changes") {
        return Err(AppError::Storage("Nothing to stash — the working tree is clean.".into()));
    }
    Ok(out.lines().next().unwrap_or("Stashed.").to_string())
}

#[tauri::command]
pub fn git_stash_pop() -> AppResult<String> {
    let (ok, out, err) = run(&["stash", "pop"])?;
    if !ok {
        let combined = format!("{out}{err}");
        if combined.contains("No stash entries") {
            return Err(AppError::Storage("No stashed changes to restore.".into()));
        }
        if combined.contains("CONFLICT") {
            return Err(AppError::Storage(
                "The stash conflicts with your current changes — it was kept. Commit or discard first, then pop again.".into(),
            ));
        }
        return Err(AppError::Storage(format!("git stash pop failed: {combined}")));
    }
    Ok("Stash restored.".into())
}

#[cfg(test)]
mod ref_tests {
    use super::*;

    #[test]
    fn ref_names_reject_flags_and_whitespace() {
        assert!(validate_ref_name("feature/login").is_ok());
        assert!(validate_ref_name("v1.2-rc").is_ok());
        assert!(validate_ref_name("-D").is_err());
        assert!(validate_ref_name("--force").is_err());
        assert!(validate_ref_name("a b").is_err());
        assert!(validate_ref_name("a..b").is_err());
        assert!(validate_ref_name("").is_err());
        assert!(validate_ref_name("  ").is_err());
    }
}
