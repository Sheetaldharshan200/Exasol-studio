//! Save a result as an Excel workbook (.xlsx): one sheet, a header row, and
//! the values as numbers, booleans or text. Built with the zip crate — the
//! format is a handful of XML files — so no spreadsheet library is needed.
//! Text cells are inline strings, never formulas.

use std::io::{Cursor, Write};

use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XlsxColumn {
    pub name: String,
    #[serde(default)]
    pub type_name: String,
}

/// Excel's limits: rows per sheet and characters per cell.
const MAX_ROWS: usize = 1_048_576;
const MAX_CELL_CHARS: usize = 32_767;

fn xml_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars().take(MAX_CELL_CHARS) {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            // XML 1.0 allows no other control characters.
            '\t' | '\n' | '\r' => out.push(c),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => out.push(c),
        }
    }
    out
}

fn is_numeric_type(t: &str) -> bool {
    let t = t.to_ascii_uppercase();
    ["DECIMAL", "DOUBLE", "FLOAT", "INT", "BIGINT", "SMALLINT", "TINYINT", "NUMBER", "NUMERIC", "REAL"].iter().any(|p| t.starts_with(p))
}

/// Exact decimal text a spreadsheet can hold without losing digits (15).
fn spreadsheet_number(s: &str) -> Option<&str> {
    let t = s.trim();
    let digits = t.chars().filter(|c| c.is_ascii_digit()).count();
    let valid = !t.is_empty() && t.parse::<f64>().is_ok_and(f64::is_finite) && t.chars().all(|c| c.is_ascii_digit() || matches!(c, '-' | '.' | 'e' | 'E' | '+'));
    (valid && digits <= 15).then_some(t)
}

fn cell(v: &Value, numeric: bool) -> String {
    let text = |s: &str| format!(r#"<c t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#, xml_text(s));
    match v {
        Value::Null => "<c/>".into(),
        Value::Bool(b) => format!(r#"<c t="b"><v>{}</v></c>"#, u8::from(*b)),
        Value::Number(n) => format!("<c><v>{n}</v></c>"),
        Value::String(s) if numeric => spreadsheet_number(s).map_or_else(|| text(s), |n| format!("<c><v>{n}</v></c>")),
        Value::String(s) => text(s),
        other => text(&other.to_string()),
    }
}

fn sheet_xml(columns: &[XlsxColumn], rows: &[Vec<Value>]) -> String {
    let mut x = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData><row>"#);
    for c in columns {
        x.push_str(&cell(&Value::String(c.name.clone()), false));
    }
    x.push_str("</row>");
    let numeric: Vec<bool> = columns.iter().map(|c| is_numeric_type(&c.type_name)).collect();
    for r in rows {
        x.push_str("<row>");
        for (i, v) in r.iter().enumerate() {
            x.push_str(&cell(v, numeric.get(i).copied().unwrap_or(false)));
        }
        x.push_str("</row>");
    }
    x.push_str("</sheetData></worksheet>");
    x
}

/// The workbook's bytes.
pub fn build_xlsx(columns: &[XlsxColumn], rows: &[Vec<Value>]) -> AppResult<Vec<u8>> {
    if rows.len() + 1 > MAX_ROWS {
        return Err(AppError::InvalidSettings(format!("A sheet holds at most {} rows; export this result as CSV instead.", MAX_ROWS - 1)));
    }
    let files: [(&str, String); 6] = [
        ("[Content_Types].xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>"#.into()),
        ("_rels/.rels", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#.into()),
        ("xl/workbook.xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Result" sheetId="1" r:id="rId1"/></sheets></workbook>"#.into()),
        ("xl/_rels/workbook.xml.rels", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#.into()),
        ("xl/styles.xml", r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>"#.into()),
        ("xl/worksheets/sheet1.xml", sheet_xml(columns, rows)),
    ];
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, body) in files {
        zip.start_file(name, opts).map_err(|e| AppError::Storage(e.to_string()))?;
        zip.write_all(body.as_bytes())?;
    }
    Ok(zip.finish().map_err(|e| AppError::Storage(e.to_string()))?.into_inner())
}

/// Ask where to save, then write the workbook there. None when cancelled.
#[tauri::command]
pub async fn save_xlsx_as(app: tauri::AppHandle, default_name: String, columns: Vec<XlsxColumn>, rows: Vec<Vec<Value>>) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let bytes = build_xlsx(&columns, &rows)?;
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_file_name(&default_name).add_filter("Excel workbook", &["xlsx"]).blocking_save_file())
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    crate::files::write_checked_bytes(&path, &bytes, crate::files::home_dir().as_deref())?;
    crate::files::approve_path(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Read;

    fn col(name: &str, t: &str) -> XlsxColumn {
        XlsxColumn { name: name.into(), type_name: t.into() }
    }

    fn sheet(bytes: Vec<u8>) -> String {
        let mut z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut s = String::new();
        z.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut s).unwrap();
        s
    }

    #[test]
    fn values_become_numbers_booleans_and_text() {
        let cols = [col("ID", "DECIMAL(36,0)"), col("N", "VARCHAR(5)"), col("B", "BOOLEAN")];
        let rows = vec![
            vec![json!(1), json!("=1+1"), json!(true)],
            vec![json!("12345678901234567890"), json!("a<b&\u{1}c"), Value::Null],
            vec![json!("42.5"), json!("42"), json!(false)],
        ];
        let x = sheet(build_xlsx(&cols, &rows).unwrap());
        assert!(x.contains(r#"<c><v>1</v></c><c t="inlineStr"><is><t xml:space="preserve">=1+1</t></is></c><c t="b"><v>1</v></c>"#), "a formula-looking text stays text");
        assert!(x.contains(r#"<t xml:space="preserve">12345678901234567890</t>"#), "more digits than a spreadsheet holds: text");
        assert!(x.contains(r#"<t xml:space="preserve">a&lt;b&amp;c</t></is></c><c/>"#), "escaped, control characters dropped, NULL empty");
        assert!(x.contains(r#"<c><v>42.5</v></c><c t="inlineStr"><is><t xml:space="preserve">42</t></is></c>"#), "numbers only in numeric columns");
    }

    #[test]
    fn every_part_is_in_the_package() {
        let bytes = build_xlsx(&[col("A", "")], &[]).unwrap();
        let z = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let names: Vec<&str> = z.file_names().collect();
        for part in ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"] {
            assert!(names.contains(&part), "{part}");
        }
    }

    #[test]
    fn spreadsheet_number_is_strict() {
        assert_eq!(spreadsheet_number(" -1.5E+3 "), Some("-1.5E+3"));
        assert_eq!(spreadsheet_number("1e400"), None, "not finite");
        assert_eq!(spreadsheet_number("NaN"), None);
        assert_eq!(spreadsheet_number("0x10"), None);
        assert_eq!(spreadsheet_number(""), None);
    }

    #[test]
    fn long_text_is_cut_to_the_cell_limit() {
        assert_eq!(xml_text(&"x".repeat(40_000)).len(), MAX_CELL_CHARS);
    }
}
