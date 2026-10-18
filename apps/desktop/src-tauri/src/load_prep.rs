//! Before a CSV load: put the file's columns in the target table's order
//! (each target column takes a file column, or nothing → NULL), and set
//! aside rows that do not have as many fields as the header — those go to a
//! reject file instead of failing the whole load. ExaPump then loads the
//! prepared copy; the original file is never changed.

use std::io::{Read, Write};

use serde::Serialize;
use tauri::Manager;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedLoad {
    /// The file to load: target columns, in order, with a header row.
    pub path: String,
    pub rows: u64,
    pub rejected: u64,
    /// Where the rejected rows are, when there are any.
    pub reject_path: Option<String>,
}

pub fn delimiter_byte(d: Option<&str>) -> AppResult<u8> {
    match d.unwrap_or(",") {
        "\\t" | "\t" | "tab" => Ok(b'\t'),
        s if s.len() == 1 && s.is_ascii() => Ok(s.as_bytes()[0]),
        other => Err(AppError::InvalidSettings(format!("The delimiter must be one character, not \"{other}\"."))),
    }
}

/// Copy `input` to `out` with the columns `mapping` picks (one entry per
/// target column: a source column index, or None for NULL) under the
/// `targets` header; rows with the wrong number of fields go to `rejects`
/// under the original header. Returns (rows kept, rows rejected).
pub fn remap<R: Read, W: Write, X: Write>(input: R, delim: u8, targets: &[String], mapping: &[Option<usize>], out: W, rejects: X) -> AppResult<(u64, u64)> {
    let err = |e: csv::Error| AppError::Storage(format!("Could not read the file: {e}"));
    let mut reader = csv::ReaderBuilder::new().delimiter(delim).flexible(true).has_headers(true).from_reader(input);
    let header = reader.headers().map_err(err)?.clone();
    let width = header.len();
    if let Some(bad) = mapping.iter().flatten().find(|&&i| i >= width) {
        return Err(AppError::InvalidSettings(format!("Column {} is not in the file (it has {width}).", bad + 1)));
    }
    let mut w = csv::WriterBuilder::new().delimiter(delim).from_writer(out);
    let mut rw = csv::WriterBuilder::new().delimiter(delim).flexible(true).from_writer(rejects);
    w.write_record(targets).map_err(err)?;
    rw.write_record(&header).map_err(err)?;
    let (mut kept, mut rejected) = (0u64, 0u64);
    for rec in reader.records() {
        let rec = rec.map_err(err)?;
        if rec.len() != width {
            rw.write_record(&rec).map_err(err)?;
            rejected += 1;
            continue;
        }
        w.write_record(mapping.iter().map(|m| m.and_then(|i| rec.get(i)).unwrap_or(""))).map_err(err)?;
        kept += 1;
    }
    w.flush()?;
    rw.flush()?;
    Ok((kept, rejected))
}

#[tauri::command]
pub async fn prepare_csv_load(app: tauri::AppHandle, path: String, delimiter: Option<String>, targets: Vec<String>, mapping: Vec<Option<usize>>) -> AppResult<PreparedLoad> {
    if targets.is_empty() || targets.len() != mapping.len() {
        return Err(AppError::InvalidSettings("Map every target column (or leave it empty).".into()));
    }
    let delim = delimiter_byte(delimiter.as_deref())?;
    let dir = app.state::<crate::state::AppState>().data_dir.join("loads");
    std::fs::create_dir_all(&dir)?;
    let stem = std::path::Path::new(&path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    // Unique per load: two loads of same-named files never share a copy.
    let run = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default();
    let (mapped, rejects) = (dir.join(format!("{stem}-{run}-mapped.csv")), dir.join(format!("{stem}-{run}-rejected.csv")));
    let (input, out, rej) = (std::fs::File::open(&path)?, std::fs::File::create(&mapped)?, std::fs::File::create(&rejects)?);
    let (rows, rejected) = tauri::async_runtime::spawn_blocking(move || remap(std::io::BufReader::new(input), delim, &targets, &mapping, out, rej))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))??;
    if rejected == 0 {
        let _ = std::fs::remove_file(&rejects);
    }
    Ok(PreparedLoad {
        path: mapped.to_string_lossy().into_owned(),
        rows,
        rejected,
        reject_path: (rejected > 0).then(|| rejects.to_string_lossy().into_owned()),
    })
}

/// Delete a prepared copy once its upload is over (reject files stay for the person).
#[tauri::command]
pub fn discard_prepared_load(app: tauri::AppHandle, path: String) -> AppResult<()> {
    let dir = app.state::<crate::state::AppState>().data_dir.join("loads");
    let p = std::path::Path::new(&path);
    if is_prepared_copy(p, &dir) {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// Only Studio's own prepared copies may be deleted this way.
fn is_prepared_copy(p: &std::path::Path, loads: &std::path::Path) -> bool {
    p.parent() == Some(loads) && p.file_name().is_some_and(|n| n.to_string_lossy().ends_with("-mapped.csv"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_prepared_copies_in_the_loads_folder_are_discarded() {
        let loads = std::path::Path::new("/d/loads");
        assert!(super::is_prepared_copy(std::path::Path::new("/d/loads/a-1-mapped.csv"), loads));
        assert!(!super::is_prepared_copy(std::path::Path::new("/d/loads/a-1-rejected.csv"), loads));
        assert!(!super::is_prepared_copy(std::path::Path::new("/home/a-mapped.csv"), loads));
        assert!(!super::is_prepared_copy(std::path::Path::new("/d/loads/sub/a-mapped.csv"), loads));
    }

    use super::*;

    fn run(input: &str, targets: &[&str], mapping: &[Option<usize>]) -> (String, String, u64, u64) {
        let (mut out, mut rej) = (Vec::new(), Vec::new());
        let t: Vec<String> = targets.iter().map(|s| s.to_string()).collect();
        let (k, r) = remap(input.as_bytes(), b',', &t, mapping, &mut out, &mut rej).unwrap();
        (String::from_utf8(out).unwrap(), String::from_utf8(rej).unwrap(), k, r)
    }

    #[test]
    fn columns_follow_the_target_order_and_unmapped_ones_are_empty() {
        let (out, _, k, r) = run("a,b,c\n1,2,3\n4,5,6\n", &["C", "A", "X"], &[Some(2), Some(0), None]);
        assert_eq!(out, "C,A,X\n3,1,\n6,4,\n");
        assert_eq!((k, r), (2, 0));
    }

    #[test]
    fn rows_with_the_wrong_number_of_fields_are_rejected_with_the_header() {
        let (out, rej, k, r) = run("a,b\n1,2\n3\n4,5,6\n\"x,y\",7\n", &["A", "B"], &[Some(0), Some(1)]);
        assert_eq!(out, "A,B\n1,2\n\"x,y\",7\n", "quoted commas are one field");
        assert_eq!(rej, "a,b\n3\n4,5,6\n");
        assert_eq!((k, r), (2, 2));
    }

    #[test]
    fn a_mapping_past_the_file_is_refused() {
        let (mut out, mut rej) = (Vec::new(), Vec::new());
        let e = remap("a\n1\n".as_bytes(), b',', &["A".into()], &[Some(3)], &mut out, &mut rej).unwrap_err();
        assert!(e.to_string().contains("Column 4 is not in the file"), "{e}");
    }

    #[test]
    fn delimiters_are_one_character() {
        assert_eq!(delimiter_byte(Some("\\t")).unwrap(), b'\t');
        assert_eq!(delimiter_byte(Some(";")).unwrap(), b';');
        assert_eq!(delimiter_byte(None).unwrap(), b',');
        assert!(delimiter_byte(Some(";;")).is_err());
    }
}
