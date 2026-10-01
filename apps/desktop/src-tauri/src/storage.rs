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

/// Atomically write a JSON document. The temp file name is unique PER CALL
/// (pid + counter): concurrent writers in the same process (e.g. a dashboard's
/// panels all appending history at once) each rename their own temp file —
/// a shared temp name made rename race and fail with ENOENT.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "json.tmp-{}-{}",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    write_private(&tmp, serde_json::to_string_pretty(value)?.as_bytes())?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Write a file only its owner can read (0600 on Unix). Studio's JSON files
/// hold connection details and, sealed or not, are nobody else's business.
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)?;
        f.write_all(bytes)
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, bytes)
    }
}

#[cfg(all(test, unix))]
mod private_tests {
    #[test]
    fn json_files_are_written_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("studio-private-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("connections.json");
        super::write_json(&path, &serde_json::json!({"a": 1})).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "got {mode:o}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
