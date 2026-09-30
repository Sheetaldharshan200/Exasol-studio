# Tasks

## 1. Rust
- [x] `attachments.rs`: `attachment_pick` + pure helpers with tests; registered in `lib.rs`.

## 2. Frontend
- [x] `ipc.attachmentPick`, `AttachmentPicks`/`PickedAttachment` types.
- [x] `folder-attachment.ts`: saved-file/folder chips, inline rebuild; tests.
- [x] `StudioAttachmentAdapter`: saved chips add/send without re-upload.
- [x] `ComposerAddAttachment`: OS picker in the desktop app, inputs as browser fallback.

## 3. Review
- [x] Codex review (7 findings, all fixed): accept list rejected the folder/saved chips before add(); symlinks followed without cycle check; cap applied after a full walk; cleaned names could collide; chip named after the original not the saved copy; skipped count dropped; unreadable entries silent.
- [x] Wiki log entry.
