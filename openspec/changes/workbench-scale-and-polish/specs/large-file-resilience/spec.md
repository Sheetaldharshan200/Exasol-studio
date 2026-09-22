# Spec Delta

## Purpose
A huge CSV, a giant git diff or a failing tab must never freeze or bring down the workbench — only the affected view degrades, and it says so.

## ADDED Requirements

### Requirement: Paged tabular reads
`fs_read_table(path, offset, limit)` SHALL stream only the requested window (limit ≤ 10,000) and return `{columns, rows, offset, hasMore}`; `fs_count_rows(path)` SHALL stream once and return the total. The preview SHALL page 1,000 rows at a time with a pager and a jump-to-row control.

#### Scenario: Window in the middle of a large CSV
- **WHEN** a 5,000,000-row CSV is opened and the user jumps to row 2,000,000
- **THEN** only rows 2,000,000–2,000,999 are read and rendered; memory does not grow with the file

#### Scenario: Header-only and empty files
- **WHEN** the file has a header and no rows, or is empty
- **THEN** the preview shows the columns (or "empty file") and no error

#### Scenario: Quoted newlines
- **WHEN** a field contains a quoted newline
- **THEN** it counts as one record for both the window and the total

### Requirement: Size-guarded text open
`routeOpen({name, size})` SHALL send tabular files over 1 MB to the grid preview, any file over 2 MB to the preview when tabular and otherwise refuse with the size, and keep the text editor for everything smaller. The preview SHALL offer "Edit as text anyway" with a warning. A failed open SHALL surface a toast with the reason.

#### Scenario: 300 MB CSV double-clicked
- **WHEN** the user opens a 300 MB CSV from the file tree
- **THEN** the paged grid opens; no text editor is created; the UI stays responsive

#### Scenario: Unreadable file
- **WHEN** the file cannot be read
- **THEN** a toast names the file and the error instead of nothing happening

### Requirement: Capped git diffs
`git_diff` SHALL return at most 1 MB of diff text; beyond that it SHALL return the `--stat` summary with `truncated: true` and the list of the largest files.

#### Scenario: Huge data file committed
- **WHEN** the selected commit changes a 200 MB CSV
- **THEN** the details pane shows the stat and "Diff too large to show (200 MB)" and the panel stays responsive

### Requirement: Per-tab error isolation
Every workbench tab body SHALL render inside a `TabErrorBoundary`; a render error SHALL show the message with "Copy details" and "Close tab" inside that tab only.

#### Scenario: One tab throws
- **WHEN** a component in tab B throws during render
- **THEN** tabs A and C keep working and tab B shows the error state

### Requirement: Soft IPC timeouts
Tab-originated IPC calls SHALL show a "still working" state after 60 s with a Cancel that abandons waiting; the UI SHALL never block on a pending invoke.

#### Scenario: Stuck sidecar
- **WHEN** a call does not answer within 60 s
- **THEN** the tab shows the waiting state and Cancel; the rest of the app remains interactive
