//! Attaching files and folders to the AI panel through the OS picker.
//!
//! A file input inside the webview is the wrong tool here: a folder pick
//! yields flattened names, every byte has to travel through the page as
//! base64, and a large dataset stalls the composer. The OS dialog returns
//! paths; Rust copies each file into the attachments folder — subfolders kept,
//! so a dataset's folder → schema mapping survives — and hands the page the
//! saved paths. Small files a message can carry inline (images, PDFs, short
//! text) come back with their bytes so the composer treats them as before.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;

/// Folder picks stay sane: at most this many files, and none of the noise.
pub const FOLDER_FILE_CAP: usize = 200;
/// Files a message can carry inline rather than by path.
pub const INLINE_LIMIT_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Picked {
    /// Folder-relative name for a folder pick (`sales/2024.csv`), bare name otherwise.
    pub name: String,
    /// Where the copy lives now.
    pub path: String,
    pub size: u64,
    pub mime: String,
    /// The bytes, base64, for a file the message carries inline; absent for data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Picks {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub items: Vec<Picked>,
    /// Folder entries left out: hidden files, dependency trees, symlinks,
    /// unreadable entries.
    pub skipped: usize,
    /// The folder had more files than the cap; the walk stopped there.
    pub capped: bool,
}

/// Entries a folder pick leaves out: dotfiles and dot-folders, dependency and
/// build trees.
pub fn skip_folder_entry(rel: &str) -> bool {
    rel.split('/').any(|part| part.starts_with('.') || matches!(part, "node_modules" | "target" | "dist" | "__pycache__"))
}

/// A folder-relative path made safe to recreate under the attachments folder:
/// plain components only, each stripped of anything but name characters.
pub fn safe_relative(rel: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in Path::new(rel).components() {
        match part {
            Component::Normal(p) => {
                let cleaned: String = p
                    .to_string_lossy()
                    .chars()
                    .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ' | '(' | ')') { c } else { '_' })
                    .collect();
                let cleaned = cleaned.trim().trim_matches('.').to_string();
                if cleaned.is_empty() {
                    return None;
                }
                out.push(cleaned);
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

/// Whether a picked file rides inline in the message: not a data table, small,
/// and of a kind the composer renders — an image, a PDF, or plain text.
pub fn inline_eligible(name: &str, size: u64) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let data = matches!(ext.as_str(), "csv" | "tsv" | "parquet" | "xlsx" | "xls" | "jsonl" | "ndjson");
    let renderable = matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "pdf" | "txt" | "md" | "sql" | "json" | "yaml" | "yml" | "xml" | "log" | "py" | "js" | "ts"
    );
    !data && renderable && size <= INLINE_LIMIT_BYTES
}

pub fn mime_for(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "json" | "jsonl" | "ndjson" => "application/json",
        "parquet" => "application/vnd.apache.parquet",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        "md" | "txt" | "sql" | "log" | "yaml" | "yml" | "py" | "js" | "ts" => "text/plain",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}

/// A destination that does not overwrite: `name (2).ext`, `name (3).ext`, …
pub fn unique_target(dir: &Path, file_name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(file_name);
    if !exists(&first) {
        return first;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (file_name.to_string(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !exists(p))
        .expect("an unused name exists")
}

/// What a folder walk found: the files as `(relative path, absolute path,
/// size)` in sorted order, how many entries were left out, and whether the
/// walk stopped at the cap.
#[derive(Debug, Default, PartialEq)]
pub struct Walk {
    pub files: Vec<(String, PathBuf, u64)>,
    pub skipped: usize,
    pub capped: bool,
}

/// The files under a folder. Noise is skipped, symlinks are never followed
/// (a link to a parent would loop forever, one to elsewhere would leave the
/// picked folder), an unreadable entry counts as skipped, and the walk stops
/// as soon as the cap is reached rather than listing a whole tree first.
pub fn walk_folder(root: &Path) -> Walk {
    fn visit(root: &Path, dir: &Path, walk: &mut Walk) {
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => {
                walk.skipped += 1;
                return;
            }
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if walk.files.len() >= FOLDER_FILE_CAP {
                walk.capped = true;
                return;
            }
            let path = entry.path();
            let rel = path.strip_prefix(root).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_default();
            let Ok(meta) = std::fs::symlink_metadata(&path) else {
                walk.skipped += 1;
                continue;
            };
            if skip_folder_entry(&rel) || meta.file_type().is_symlink() {
                walk.skipped += 1;
                continue;
            }
            if meta.is_dir() {
                visit(root, &path, walk);
            } else {
                walk.files.push((rel, path, meta.len()));
            }
        }
    }
    let mut walk = Walk::default();
    visit(root, root, &mut walk);
    walk
}

fn attachments_dir() -> AppResult<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve the home directory.".into()))?;
    let dir = PathBuf::from(home).join("ExasolStudio").join("attachments");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Copy one file to `target` and describe the copy. `name` is what the chip
/// shows: the saved name, so a `(2)` counter or a cleaned character is what
/// the person sees and what the note names.
fn copy_in(source: &Path, target: &Path, name: &str) -> AppResult<Picked> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(source, target).map_err(|e| AppError::Storage(format!("Could not copy {}: {e}", source.display())))?;
    let size = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);
    let inline = inline_eligible(name, size).then(|| {
        use base64::Engine;
        std::fs::read(target).map(|b| base64::engine::general_purpose::STANDARD.encode(b)).unwrap_or_default()
    });
    Ok(Picked { name: name.to_string(), path: target.to_string_lossy().into_owned(), size, mime: mime_for(name).into(), inline })
}

fn to_path(fp: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
    fp.into_path().ok()
}

/// Open the OS picker for files or a folder, copy the picks into the
/// attachments folder, and describe them for the composer.
#[tauri::command]
pub async fn attachment_pick(app: AppHandle, kind: String) -> AppResult<Picks> {
    use tauri_plugin_dialog::DialogExt;
    let dir = attachments_dir()?;
    let picked = tauri::async_runtime::spawn_blocking(move || match kind.as_str() {
        "folder" => app.dialog().file().set_title("Attach a folder").blocking_pick_folder().map(|f| ("folder", vec![f])),
        _ => app.dialog().file().set_title("Attach files").blocking_pick_files().map(|fs| ("files", fs)),
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))?;
    let Some((kind, picks)) = picked else {
        return Ok(Picks { kind: "none".into(), folder: None, items: vec![], skipped: 0, capped: false });
    };
    let exists = |p: &Path| p.exists();
    if kind == "folder" {
        let Some(root) = picks.into_iter().next().and_then(to_path) else {
            return Ok(Picks { kind: "none".into(), folder: None, items: vec![], skipped: 0, capped: false });
        };
        let folder = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "folder".into());
        let base = unique_target(&dir, &folder, exists);
        let walk = walk_folder(&root);
        let mut items = Vec::with_capacity(walk.files.len());
        let mut skipped = walk.skipped;
        for (rel, source, _) in walk.files {
            let Some(safe) = safe_relative(&rel) else {
                skipped += 1;
                continue;
            };
            // Two originals can clean to one name (`a:b.csv`, `a*b.csv`); the
            // second gets a counter instead of replacing the first.
            let parent = safe.parent().map(|p| base.join(p)).unwrap_or_else(|| base.clone());
            let file_name = safe.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let target = unique_target(&parent, &file_name, exists);
            let saved_rel = target.strip_prefix(&base).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or(rel);
            items.push(copy_in(&source, &target, &saved_rel)?);
        }
        return Ok(Picks { kind: "folder".into(), folder: Some(folder), items, skipped, capped: walk.capped });
    }
    let mut items = Vec::new();
    for source in picks.into_iter().filter_map(to_path) {
        let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "attachment".into());
        let Some(safe) = safe_relative(&name) else { continue };
        let target = unique_target(&dir, &safe.to_string_lossy(), exists);
        let saved_name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(name);
        items.push(copy_in(&source, &target, &saved_name)?);
    }
    Ok(Picks { kind: "files".into(), folder: None, items, skipped: 0, capped: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_noise_is_skipped_and_paths_are_made_safe() {
        for rel in [".git/config", "src/.env", "node_modules/x/index.js", "target/debug/a", "dist/app.js", "__pycache__/m.pyc"] {
            assert!(skip_folder_entry(rel), "{rel}");
        }
        for rel in ["sales/2024.csv", "a.b/c.parquet", "README.md"] {
            assert!(!skip_folder_entry(rel), "{rel}");
        }
        assert_eq!(safe_relative("sales/2024 (Q1).csv"), Some(PathBuf::from("sales/2024 (Q1).csv")));
        assert_eq!(safe_relative("a:b/c*d.csv"), Some(PathBuf::from("a_b/c_d.csv")));
        assert_eq!(safe_relative("../escape.csv"), None);
        assert_eq!(safe_relative("/abs/x.csv"), None);
        assert_eq!(safe_relative(""), None);
    }

    #[test]
    fn inline_eligibility_follows_kind_and_size() {
        assert!(inline_eligible("chart.png", 10_000));
        assert!(inline_eligible("notes.md", 2_000));
        assert!(!inline_eligible("big.png", INLINE_LIMIT_BYTES + 1));
        assert!(!inline_eligible("sales.csv", 10), "a data table travels by path however small");
        assert!(!inline_eligible("model.parquet", 10));
        assert!(!inline_eligible("archive.zip", 10));
        assert_eq!(mime_for("x.parquet"), "application/vnd.apache.parquet");
        assert_eq!(mime_for("x.PNG"), "image/png");
    }

    #[test]
    fn a_taken_name_gets_a_counter() {
        let dir = Path::new("/att");
        let taken = |p: &Path| p == Path::new("/att/a.csv") || p == Path::new("/att/a (2).csv");
        assert_eq!(unique_target(dir, "a.csv", taken), PathBuf::from("/att/a (3).csv"));
        assert_eq!(unique_target(dir, "b.csv", taken), PathBuf::from("/att/b.csv"));
        assert_eq!(unique_target(dir, "noext", |p| p == Path::new("/att/noext")), PathBuf::from("/att/noext (2)"));
    }

    #[test]
    fn walking_a_folder_keeps_structure_skips_noise_and_caps() {
        let root = std::env::temp_dir().join(format!("studio-attach-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("sales")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join("sales/2024.csv"), "a,b").unwrap();
        std::fs::write(root.join("README.md"), "x").unwrap();
        std::fs::write(root.join(".git/config"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();
        let walk = walk_folder(&root);
        assert_eq!(walk.files.iter().map(|(r, _, _)| r.as_str()).collect::<Vec<_>>(), vec!["README.md", "sales/2024.csv"]);
        assert_eq!(walk.skipped, if cfg!(unix) { 2 } else { 1 }, ".git and the symlink are left out, and the link is never followed");
        assert!(!walk.capped);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_walk_stops_at_the_cap_instead_of_listing_the_whole_tree() {
        let root = std::env::temp_dir().join(format!("studio-attach-cap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        for i in 0..(FOLDER_FILE_CAP + 25) {
            std::fs::write(root.join(format!("f{i:04}.txt")), "x").unwrap();
        }
        let walk = walk_folder(&root);
        assert_eq!(walk.files.len(), FOLDER_FILE_CAP);
        assert!(walk.capped);
        let _ = std::fs::remove_dir_all(&root);
    }
}
