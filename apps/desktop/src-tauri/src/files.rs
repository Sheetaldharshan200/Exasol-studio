//! Small filesystem helpers invoked from the frontend after a native dialog
//! has produced a user-chosen path (writing via std::fs avoids fs-plugin
//! scope configuration for arbitrary save locations).

use crate::error::AppResult;

/// Write UTF-8 text to an absolute path chosen by the user in a save dialog.
#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> AppResult<()> {
    std::fs::write(&path, contents)?;
    Ok(())
}
