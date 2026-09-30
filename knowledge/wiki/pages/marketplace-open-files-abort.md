---
title: Marketplace abort on open — launchd's 256 open files, one HTTP client per repo, panic = abort
category: gotcha
type: root-cause
updated: 2026-09-30
---

# Symptom

Opening the Marketplace in a build launched with `open` (that is, by launchd)
killed the app: macOS "Exasol Studio quit unexpectedly", `EXC_CRASH (SIGABRT)`
on a `tokio-rt-worker` thread, 265 threads alive at the crash. The same build
launched from a terminal did not crash but showed every release label and
"Loading versions…" for a long time.

# Root cause

- The Marketplace asks Rust for the latest release of **every** catalog
  repository at once — 123 `market_release` calls.
- Each call ran `spawn_blocking` with a **fresh** `reqwest::blocking::Client::new()`.
  A blocking client owns a thread, a current-thread runtime, a kqueue and its
  pipe, plus the sockets — so 123 threads + 123 runtimes, all at once.
- launchd starts GUI apps with a soft limit of **256 open files**
  (`launchctl limit maxfiles` → `256 unlimited`); a terminal shell had 1048576.
- Once the kqueue/pipe/socket creation failed, `Client::new()`'s
  `.expect("Client::new()")` panicked, and the release profile has
  `panic = "abort"` — the process was gone before anything was logged.
- Stripped binary (`strip = true`) → the crash report had no symbols; the
  diagnosis came from the thread count, the parent (launchd), the file limit,
  and reading the reqwest source (`blocking/client.rs`).

# Fix (2026-09-30)

1. `upstream::http()` — one shared blocking client (OnceLock) used by every
   synchronous fetch in the app (upstream, github_auth, updates,
   verified_lock, skills_market). Built with `builder().build().ok()`, never
   `Client::new()`; only a client that was built is kept, so a build that
   failed under pressure is retried next time (Codex finding).
2. `market_release` takes a turn from a 6-permit `tokio::sync::Semaphore`
   around its fetch — cache hits never wait.
3. `limits::raise_open_files()` at startup lifts `RLIMIT_NOFILE` soft to
   `min(8192, hard)` (pure `target_soft` is tested).
4. `github_status/connect/disconnect` are async and run their network work in
   `spawn_blocking` — a sync command with network blocked the main thread and
   every other command's reply. Connect and disconnect run whole under one
   operation lock, and disconnect removes the file while holding the cache
   lock, so a status call cannot reload a token that is about to go.
5. The frontend fills each release label as its own answer arrives instead of
   after `Promise.allSettled` over all 123.

# Rules that follow

- Never `reqwest::blocking::Client::new()` in app code — use `upstream::http()`.
- Never network in a **sync** Tauri command.
- Fan-outs over the catalog go through a gate in Rust, not the frontend.
- With `panic = "abort"`, treat every `expect`/`unwrap` on a fallible runtime
  resource as a crash; prefer `Option`/`Result` and a degraded answer.
