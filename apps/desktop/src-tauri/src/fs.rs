//! Local filesystem browsing for the Files activity: list directories, read a
//! text file into a query tab, resolve common home roots, and a bounded
//! recursive filename search. Reads via std::fs (no fs-plugin scope needed).

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub ext: Option<String>,
}

fn to_entry(path: std::path::PathBuf, name: String) -> FsEntry {
    let meta = std::fs::metadata(&path).ok();
    let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified = meta.as_ref().and_then(|m| m.modified().ok()).map(|m| {
        let dt: chrono::DateTime<chrono::Utc> = m.into();
        dt.to_rfc3339()
    });
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase());
    FsEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        size,
        modified,
        ext,
    }
}

/// Entries directly inside a directory, folders first then files (A→Z).
#[tauri::command]
pub async fn fs_list_dir(path: String) -> AppResult<Vec<FsEntry>> {
    let read = std::fs::read_dir(&path)?;
    let mut entries: Vec<FsEntry> = read
        .flatten()
        .map(|e| to_entry(e.path(), e.file_name().to_string_lossy().to_string()))
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Read a UTF-8 text file (capped at 8 MB) to open it in a query tab.
#[tauri::command]
pub async fn fs_read_text(path: String) -> AppResult<String> {
    let meta = std::fs::metadata(&path)?;
    if meta.len() > 8_000_000 {
        return Err(AppError::Storage("File is too large to open (over 8 MB).".to_string()));
    }
    let bytes = std::fs::read(&path)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// A dedicated, always-present workspace folder (~/ExasolStudio) where saved
/// scripts land, so "Save" never needs a separate window — the file just shows
/// up in the Files panel.
#[tauri::command]
pub fn fs_workspace_dir() -> AppResult<FsEntry> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| AppError::Storage("Could not resolve home directory.".to_string()))?;
    let dir = std::path::PathBuf::from(home).join("ExasolStudio");
    std::fs::create_dir_all(&dir)?;
    Ok(to_entry(dir, "My Workspace".to_string()))
}

/// The user's home directory as the single tree root (expand it to browse).
#[tauri::command]
pub fn fs_home_roots() -> AppResult<Vec<FsEntry>> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let base = std::path::PathBuf::from(&home);
    if !home.is_empty() && base.is_dir() {
        return Ok(vec![to_entry(base, "Home".to_string())]);
    }
    Ok(Vec::new())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TablePreview {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
    pub format: String,
}

/// Read a tabular file (CSV / TSV / Parquet) into a preview grid.
#[tauri::command]
pub async fn fs_read_table(path: String, limit: Option<usize>) -> AppResult<TablePreview> {
    let limit = limit.unwrap_or(1000).clamp(1, 100_000);
    let ext = std::path::Path::new(&path)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "csv" => read_delimited(&path, b',', limit),
        "tsv" => read_delimited(&path, b'\t', limit),
        "parquet" => read_parquet(&path, limit),
        other => Err(AppError::Storage(format!("Cannot preview .{other} files."))),
    }
}

fn read_delimited(path: &str, delimiter: u8, limit: usize) -> AppResult<TablePreview> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_path(path)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let columns: Vec<String> = reader
        .headers()
        .map(|h| h.iter().map(|s| s.to_string()).collect())
        .unwrap_or_default();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut truncated = false;
    for record in reader.records() {
        if rows.len() >= limit {
            truncated = true;
            break;
        }
        if let Ok(rec) = record {
            rows.push(rec.iter().map(|s| s.to_string()).collect());
        }
    }
    Ok(TablePreview {
        columns,
        rows,
        truncated,
        format: if delimiter == b'\t' { "TSV".into() } else { "CSV".into() },
    })
}

fn read_parquet(path: &str, limit: usize) -> AppResult<TablePreview> {
    use parquet::file::reader::{FileReader, SerializedFileReader};

    let file = std::fs::File::open(path)?;
    let reader = SerializedFileReader::new(file).map_err(|e| AppError::Storage(e.to_string()))?;
    let mut iter = reader
        .get_row_iter(None)
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let mut columns: Vec<String> = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut truncated = false;

    while let Some(record) = iter.next() {
        let row = record.map_err(|e| AppError::Storage(e.to_string()))?;
        if columns.is_empty() {
            columns = row.get_column_iter().map(|(name, _)| name.clone()).collect();
        }
        if rows.len() >= limit {
            truncated = true;
            break;
        }
        rows.push(row.get_column_iter().map(|(_, field)| field.to_string()).collect());
    }

    Ok(TablePreview { columns, rows, truncated, format: "Parquet".into() })
}

/// Bounded recursive filename search under a root (skips hidden entries).
#[tauri::command]
pub async fn fs_search(root: String, query: String, limit: Option<usize>) -> AppResult<Vec<FsEntry>> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(200).clamp(1, 1000);
    let mut out: Vec<FsEntry> = Vec::new();
    let mut stack = vec![std::path::PathBuf::from(&root)];
    let mut scanned = 0usize;

    while let Some(dir) = stack.pop() {
        if out.len() >= limit || scanned > 40_000 {
            break;
        }
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in read.flatten() {
            scanned += 1;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let is_dir = path.is_dir();
            if name.to_lowercase().contains(&needle) {
                out.push(to_entry(path.clone(), name));
                if out.len() >= limit {
                    break;
                }
            }
            if is_dir {
                stack.push(path);
            }
        }
    }
    Ok(out)
}

/// Delete a file (or directory tree) on the local filesystem. The UI confirms
/// before calling and only offers this for workspace/preview files.
#[tauri::command]
pub fn fs_delete(path: String) -> AppResult<()> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p)?;
    } else {
        std::fs::remove_file(p)?;
    }
    Ok(())
}
