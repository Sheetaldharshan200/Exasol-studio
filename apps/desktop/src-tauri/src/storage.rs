use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppResult;

/// Read a JSON document from disk, returning `default` when the file does not
/// exist. A CORRUPT file (e.g. interleaved writes from two app instances —
/// "trailing characters at line N") must never fail user actions: it is
/// quarantined aside as `<name>.corrupt-<ts>` and the default is returned.
pub fn read_json<T: DeserializeOwned>(path: &Path, default: T) -> AppResult<T> {
    if !path.exists() {
        return Ok(default);
    }
    let raw = std::fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(default);
    }
    match serde_json::from_str(&raw) {
        Ok(v) => Ok(v),
        Err(err) => {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let quarantine = path.with_extension(format!("json.corrupt-{ts}"));
            let _ = std::fs::rename(path, &quarantine);
            eprintln!(
                "storage: quarantined corrupt JSON {} ({err}) -> {}",
                path.display(),
                quarantine.display()
            );
            Ok(default)
        }
    }
}

/// Atomically write a JSON document. The temp file name is process-unique so
/// two running app instances can never interleave into the same temp file.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, serde_json::to_string_pretty(value)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}
