# AI panel: attach files and folders through the OS picker

## Why

The AI panel's attach menu drove two hidden `<input>` elements inside the
webview: one with `multiple`, one with `webkitdirectory`. Both misbehaved.
A folder pick came back as flat file objects whose only structure was a
relative-path string the webview does not preserve once saved, so a
dataset's `sales/2024.csv` landed as `sales_2024.csv`. Every byte of every
pick travelled through the page as base64 before Rust wrote it back to disk,
so a folder of Parquet files stalled the composer, and a multi-select of a
few hundred megabytes was a silent wait with nothing to show for it.

Studio is a desktop app. The OS already has a files dialog and a folder
dialog that return paths; Rust can copy what was picked without the page
ever seeing the bytes. That is what this change does.

## What

- A Rust command `attachment_pick(kind)` opens the OS picker for files or a
  folder, copies the picks into `~/ExasolStudio/attachments` — a folder's
  subfolders kept, names de-duplicated with a counter — and returns one
  descriptor per file: folder-relative name, saved path, size, MIME type,
  and the bytes inline only for a small file the composer renders itself
  (an image, a PDF, short text).
- The attach menu calls it in the desktop app. The `<input>` elements stay
  only as the browser fallback.
- Folders and data files become chips that record what is already on disk.
  Sending writes nothing: the note the agent reads is built from the saved
  paths. Inline files keep taking the stock path, so previews are unchanged.
- Folder picks skip dotfiles and dependency/build trees and stop at 200
  files; the chip says how many were left out.

## Out of scope

Drag-and-drop and paste keep their current in-page path; both already carry
`File` objects with bytes and are small by nature.
