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
    /// More rows follow this window (kept as `truncated` for older callers).
    pub truncated: bool,
    pub has_more: bool,
    /// The window's first row index (0-based) — echoes the request.
    pub offset: usize,
    pub format: String,
}

/// One WINDOW of a tabular file (CSV / TSV / Parquet): `offset` rows are
/// skipped while streaming and only `limit` are kept, so a 5-million-row CSV
/// costs the same memory as a 5-row one. `limit` is clamped to 10,000 — a grid
/// never shows more at once, and 100,000 rows of strings is what used to hang
/// the app.
#[tauri::command]
pub async fn fs_read_table(path: String, limit: Option<usize>, offset: Option<usize>) -> AppResult<TablePreview> {
    let limit = limit.unwrap_or(1000).clamp(1, 10_000);
    let offset = offset.unwrap_or(0);
    match table_kind(&path)? {
        TableKind::Delimited(delim) => read_delimited(&path, delim, offset, limit),
        TableKind::Parquet => read_parquet(&path, offset, limit),
    }
}

/// Total data rows of a tabular file — one streaming pass for CSV/TSV (the
/// only correct answer with quoted newlines), the footer for Parquet.
#[tauri::command]
pub async fn fs_count_rows(path: String) -> AppResult<u64> {
    match table_kind(&path)? {
        TableKind::Delimited(delim) => {
            let mut reader = csv::ReaderBuilder::new()
                .delimiter(delim)
                .flexible(true)
                .from_path(&path)
                .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(reader.records().filter(|r| r.is_ok()).count() as u64)
        }
        TableKind::Parquet => {
            use parquet::file::reader::{FileReader, SerializedFileReader};
            let file = std::fs::File::open(&path)?;
            let reader = SerializedFileReader::new(file).map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(reader.metadata().file_metadata().num_rows().max(0) as u64)
        }
    }
}

enum TableKind {
    Delimited(u8),
    Parquet,
}

fn table_kind(path: &str) -> AppResult<TableKind> {
    let ext = std::path::Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "csv" => Ok(TableKind::Delimited(b',')),
        "tsv" => Ok(TableKind::Delimited(b'\t')),
        "parquet" => Ok(TableKind::Parquet),
        other => Err(AppError::Storage(format!("Cannot preview .{other} files."))),
    }
}

fn read_delimited(path: &str, delimiter: u8, offset: usize, limit: usize) -> AppResult<TablePreview> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_path(path)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let columns: Vec<String> = reader
        .headers()
        .map(|h| h.iter().map(|s| s.to_string()).collect())
        .unwrap_or_default();
    let (rows, has_more) = window(reader.records().filter_map(Result::ok).map(|rec| rec.iter().map(|s| s.to_string()).collect()), offset, limit);
    Ok(TablePreview {
        columns,
        rows,
        truncated: has_more,
        has_more,
        offset,
        format: if delimiter == b'\t' { "TSV".into() } else { "CSV".into() },
    })
}

fn read_parquet(path: &str, offset: usize, limit: usize) -> AppResult<TablePreview> {
    use parquet::file::reader::{FileReader, SerializedFileReader};

    let file = std::fs::File::open(path)?;
    let reader = SerializedFileReader::new(file).map_err(|e| AppError::Storage(e.to_string()))?;
    // Column names come from the schema, so an empty window still has headers.
    let columns: Vec<String> = reader
        .metadata()
        .file_metadata()
        .schema_descr()
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let iter = reader
        .get_row_iter(None)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let (rows, has_more) = window(
        iter.filter_map(Result::ok).map(|row| row.get_column_iter().map(|(_, field)| field.to_string()).collect()),
        offset,
        limit,
    );
    Ok(TablePreview { columns, rows, truncated: has_more, has_more, offset, format: "Parquet".into() })
}

/// Skip `offset` rows, keep `limit`, and peek one further to learn whether
/// more follow — without ever holding more than `limit` rows.
fn window<I: Iterator<Item = Vec<String>>>(rows: I, offset: usize, limit: usize) -> (Vec<Vec<String>>, bool) {
    let mut it = rows.skip(offset);
    let kept: Vec<Vec<String>> = it.by_ref().take(limit).collect();
    let has_more = it.next().is_some();
    (kept, has_more)
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

#[cfg(test)]
mod table_window_tests {
    use super::*;

    fn csv_file(body: &str) -> tempfile::NamedTempFile {
        let f = tempfile::Builder::new().suffix(".csv").tempfile().unwrap();
        std::fs::write(f.path(), body).unwrap();
        f
    }

    #[test]
    fn a_window_in_the_middle_keeps_only_its_rows_and_knows_more_follow() {
        let f = csv_file("id,name\n1,a\n2,b\n3,c\n4,d\n5,e\n");
        let p = read_delimited(f.path().to_str().unwrap(), b',', 1, 2).unwrap();
        assert_eq!(p.columns, vec!["id", "name"]);
        assert_eq!(p.rows, vec![vec!["2", "b"], vec!["3", "c"]]);
        assert!(p.has_more);
        assert_eq!(p.offset, 1);
        let last = read_delimited(f.path().to_str().unwrap(), b',', 3, 2).unwrap();
        assert_eq!(last.rows.len(), 2);
        assert!(!last.has_more, "the window that reaches the end reports no more");
    }

    #[test]
    fn past_the_end_header_only_and_empty_files_are_answers_not_errors() {
        let f = csv_file("id,name\n1,a\n");
        let past = read_delimited(f.path().to_str().unwrap(), b',', 10, 5).unwrap();
        assert!(past.rows.is_empty() && !past.has_more);
        let h = csv_file("id,name\n");
        let header_only = read_delimited(h.path().to_str().unwrap(), b',', 0, 5).unwrap();
        assert_eq!(header_only.columns, vec!["id", "name"]);
        assert!(header_only.rows.is_empty());
        let e = csv_file("");
        let empty = read_delimited(e.path().to_str().unwrap(), b',', 0, 5).unwrap();
        assert!(empty.columns.is_empty() && empty.rows.is_empty());
    }

    #[test]
    fn quoted_newlines_are_one_record_for_the_window_and_the_count() {
        let f = csv_file("id,note\n1,\"first\nline\"\n2,plain\n3,\"a,b\"\n");
        let p = read_delimited(f.path().to_str().unwrap(), b',', 0, 10).unwrap();
        assert_eq!(p.rows.len(), 3);
        assert_eq!(p.rows[0][1], "first\nline");
        let n = tauri::async_runtime::block_on(fs_count_rows(f.path().to_string_lossy().to_string())).unwrap();
        assert_eq!(n, 3);
    }

    #[test]
    fn the_limit_is_clamped_and_unknown_extensions_are_refused() {
        let f = csv_file("id\n1\n");
        let p = tauri::async_runtime::block_on(fs_read_table(f.path().to_string_lossy().to_string(), Some(1_000_000), None)).unwrap();
        assert_eq!(p.rows.len(), 1);
        assert!(table_kind("notes.txt").is_err());
    }

    #[test]
    fn window_never_holds_more_than_limit() {
        let rows = (0..100).map(|i| vec![i.to_string()]);
        let (kept, more) = window(rows, 95, 10);
        assert_eq!(kept.len(), 5);
        assert!(!more);
        let (kept, more) = window((0..100).map(|i| vec![i.to_string()]), 0, 10);
        assert_eq!(kept.len(), 10);
        assert!(more);
    }
}
