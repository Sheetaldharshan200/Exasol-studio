use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppResult;

/// Read a JSON document from disk, returning `default` when the file does not exist.
pub fn read_json<T: DeserializeOwned>(path: &Path, default: T) -> AppResult<T> {
    if !path.exists() {
        return Ok(default);
    }
    let raw = std::fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(default);
    }
    Ok(serde_json::from_str(&raw)?)
}

/// Atomically write a JSON document (write to temp file, then rename).
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(value)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
