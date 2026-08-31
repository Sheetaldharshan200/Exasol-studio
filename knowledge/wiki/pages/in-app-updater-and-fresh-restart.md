---
title: In-app updater, non-destructive restart, and local-setup loader
type: howto
category: desktop-app
---

# In-app updater + non-destructive restart

How Exasol Studio updates itself, why a restart no longer loses your work, and
the gotchas that bit us. Code: `apps/desktop/src/features/onboarding/UpdateBanner.tsx`,
`apps/desktop/src/lib/workspace-persist.ts`, `apps/desktop/src/features/assistant/AssistantPanel.tsx`,
`apps/desktop/src-tauri/src/local_runtime.rs`, `apps/desktop/src/features/marketplace/LocalSetupFloating.tsx`.

## The update flow is PULL, not push

`@tauri-apps/plugin-updater` is pull-based. `UpdateBanner` calls `check()` **once
on app mount** (no polling). Publishing a `v*` release does NOT push to devices —
each app finds the newer build the **next time it starts** and compares its own
version (from `tauri.conf.json`) to `latest.json`. A long-running app won't see a
release until it restarts unless we add periodic re-checks.

Endpoint + trust are already wired: `tauri.conf.json` has `createUpdaterArtifacts:
true`, a `pubkey`, and `endpoints: [.../releases/latest/download/latest.json]`;
the release workflow patches `latest.json`.

Phased UX: `available → downloading → downloaded → installing → installed → error`,
driven by `update.download(onEvent)` (Started/Progress/Finished byte events) then
`update.install()` then `relaunch()`. Explicit Download / Install buttons + a
Restart button. Minimizable to a corner pill. Download status is proper:
"Starting the download…" (no bytes yet) → "Downloading… X.X MB" (no server total)
→ "Downloading… N%" + a thin bar (total known).

`check()` only returns an update when the release is **strictly newer**, so once a
device installs the new version it goes quiet — no re-notify. The notification-
centre notice (a `studio:notice` window event, `go: "update"`) is deduped by
title+body and clicking it re-opens/un-minimizes the banner.

## relaunch() permission: it's `restart`, not `relaunch`

`relaunch()` in the JS plugin invokes the command **`plugin:process|restart`**, so
the capability must grant **`process:allow-restart`** (already in
`capabilities/default.json`). There is no `process:allow-relaunch`. Do not "fix" it
to relaunch.

Dev caveat: `relaunch()` cannot restart a `tauri dev` (`cargo run`) process — it
re-execs the *installed* binary. Restart is only real on an installed `.app`.

## Restart is non-destructive (tabs + AI sessions survive)

Tabs/groups/active-tab were **in-memory only** — any restart wiped them. Now
`lib/workspace-persist.ts` serializes `{tabsByConn, groupsByConn, activeIdByConn}`
to localStorage (survives relaunch; WKWebView storage is on disk) and rehydrates on
mount. It keeps only a tab's identity + SQL + which object/dashboard it shows;
drops transient/heavy state (results, run status, live progress, plan data,
artifact HTML) which re-runs on demand. Tabs whose view needs an identity field
(dashboard→dashboardId, object→objectRef+objectProfileId, filePreview→filePath) are
dropped on restore if it's missing, else they'd render as the generic Visualizer.
A debounced save PLUS a synchronous `pagehide`/`beforeunload` flush (so a change
inside the debounce window isn't lost on the way out). AI sessions already persist
server-side; the active session id is now remembered + restored in AssistantPanel.

## GOTCHA: `.exa-indeterminate` needs a `position: relative` parent

`.exa-indeterminate` (global.css) is `position: absolute` with a green gradient +
glow. If its bar container is NOT `position: relative`, the sliver escapes to the
nearest positioned ancestor (the whole banner card) and renders as a **big green
glowing blob** — this was the "green circle" during update download/install. Fix:
give the bar wrapper `relative` (ResultsPanel did; UpdateBanner didn't). We removed
the indeterminate animation from UpdateBanner entirely and kept only a contained
determinate bar.

## Local-setup loader shows only the essentials

`LocalSetupFloating` now shows a determinate progress bar + a checklist of only the
three essentials — **Exasol Personal (local) · ExaPump · MCP server**. The other
bundled pieces (`pyexasol`, `agent-skills`, `fable-method` = the "Fable Method"
skill, `semantic_views`) still install silently in the background; they just don't
clutter the card. Registered component keys live in `local_database.rs`
`BootstrapStatus::default`.

## Verified download is resilient

`local_runtime.rs::download_verified` now has connect/overall timeouts and 4-attempt
exponential backoff, retrying only transient failures (network send errors,
5xx/408/429, checksum mismatch from a truncated transfer) and failing fast on a real
4xx. `retryable_status(u16)` is the tested decision. This fixed local setup aborting
on a transient "error sending request" while fetching exapump.

## Full wipe (fresh install)

Kill the local DB daemon `mac-runner-aarch64 __daemon__ … db:8565,ssh:2224` (needs
`kill -9`; SIGTERM isn't enough) to free ports 8565/2224; kill the Studio
`mcp-gateway.cjs`. Remove `~/Library/{Application Support,WebKit,Caches}/com.exasol.studio`
(Application Support is ~2.8G: vault, connections, agent, personal-local DB, python,
exapump; WebKit holds the localStorage onboarding/workspace/notice flags). Leave the
`llm-wiki`/`obsidian` MCP servers alone — they're the dev session's knowledge tools,
not Studio's.

## Release

2026.1.0 was cut from `agent-sql-casing` (tag `v2026.1.0`). Version must be bumped in
`apps/desktop/package.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`
together. `main` is protected (PR-only) and lands branch work via squash-PR, so the
tag/release can sit ahead of `main`.
