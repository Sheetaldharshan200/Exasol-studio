# Design

## Rust: `attachments.rs`

- `attachment_pick(app, kind)` — `kind` is `"files"` or `"folder"`. The
  dialog runs in `spawn_blocking` (tauri-plugin-dialog's blocking pickers).
  A cancelled dialog answers `{kind: "none", items: []}`.
- Pure, tested helpers: `skip_folder_entry` (dotfiles, `node_modules`,
  `target`, `dist`, `__pycache__`), `safe_relative` (plain components only,
  name characters, refuses `..`/absolute), `inline_eligible` (renderable
  kind, not a data table, ≤ 512 KB), `mime_for`, `unique_target`
  (`name (2).ext`), `walk_folder` (sorted, capped at 200, counts skipped).
- Copies go to `~/ExasolStudio/attachments/<folder>/<rel>` for a folder and
  `~/ExasolStudio/attachments/<name>` for files, the same root the existing
  `save_attachment` uses, so the agent's tools reach both alike.

## Frontend

- `ipc.attachmentPick(kind)` typed as `AttachmentPicks`.
- `folder-attachment.ts` gains `SAVED_FILE_MIME`, `makeSavedFileAttachment`,
  `makeSavedFolderAttachment` (manifest entries carry `savedPath`),
  `readSavedFile`, `fileFromInline`.
- `StudioAttachmentAdapter`: `add` accepts a saved-file chip as
  `requires-action`; `send` emits the data-file note from the saved record
  (with a three-line header preview for small CSV-like files) and the folder
  note from saved entries, without writing.
- `ComposerAddAttachment`: in Tauri the two menu items call the picker;
  inline picks are rebuilt as real `File`s so the stock preview path renders
  them; everything else becomes a saved chip.

## Why not stream through the page

The webview's `File` API has no path; the only way to keep a folder's
structure and avoid base64 round-trips is to let the host copy by path.
