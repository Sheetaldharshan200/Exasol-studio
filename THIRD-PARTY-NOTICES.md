# Third-party notices

This project includes code adapted from the following open-source projects.

## GitDesktop

- Source: https://github.com/theBGuy/GitDesktop
- Copyright 2026 theBGuy
- License: Apache License, Version 2.0 — full text bundled at
  [`licenses/GitDesktop-Apache-2.0.txt`](licenses/GitDesktop-Apache-2.0.txt)
  (also at http://www.apache.org/licenses/LICENSE-2.0)

Ported files (each carries an attribution header):

- `apps/desktop/src/components/studio/GitLogTab.tsx` — commit history list,
  commit detail view, diff-stat, and shared relative-time clock, adapted from
  `src/features/history/HistoryPanel.tsx`, `src/features/history/CommitDetailView.tsx`,
  `src/components/diff-stat.tsx`, and `src/components/relative-time.tsx`.
- `apps/desktop/src/lib/git-time.ts` — relative-time formatting, adapted from
  `src/lib/time.ts`.
- `apps/desktop/src-tauri/src/git.rs` (the "Commit history" section) — rich log
  format/parsing, commit details, numstat parsing, and per-file commit diffs,
  adapted from `src-tauri/src/git/history.rs` and `src-tauri/src/git/diff.rs`.

Per the Apache License 2.0, the above notice is retained and the adapted files
are marked as changed from the originals.
