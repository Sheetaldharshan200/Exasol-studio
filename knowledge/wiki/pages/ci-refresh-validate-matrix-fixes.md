---
title: CI — refresh-runtime-components Validate matrix: the five root causes
type: finding
category: ci
date: 2026-08-01
---

# Refresh Validate matrix: five platform failures, five distinct root causes

The daily "Refresh bundled runtime components" workflow's 5-platform Validate
matrix failed for weeks (134/1/101 exit codes). Fixed 2026-07-31/08-01 across
four diagnostic passes — each fix peeled the layer to reveal the next real
error. All from actual run logs, never guessed. Run 30658138981 = fully green.

## The five root causes

1. **macOS (exit 134)** — `vite build` SIGABRT: node V8 heap OOM on the 7 GB
   runners (Monaco/Perspective/echarts bundle). Fix: `NODE_OPTIONS:
   --max-old-space-size=6144` on BOTH the build step and the tauri-build step
   (tauri re-runs vite via beforeBuildCommand). Same fix release-app.yml already
   carried.

2. **Linux (exit 101)** — `cargo test` runs Tauri's build.rs, which requires the
   resource `packages/agent-core/dist/exa-agent.cjs` — produced only by
   agent-core `build:cli`, not `build`. Fix: run `build:cli` in Validate.

3. **Windows (exit 1, pass 1)** — Windows `run:` defaults to **PowerShell**,
   which mangles bash line-continuations (`\`) and `python -c` quoting
   ("Failed to spawn: \\"). Fix: `shell: bash` on cross-platform steps.

4. **Linux (pass 2)** — "Start Nano" waited for port 8563 with a bare TCP
   connect, but **Docker's port proxy accepts before the DB engine is up**, so
   the semantic-views installer immediately hit `SSL: UNEXPECTED_EOF`. Fix:
   poll a real `pyexasol connect + SELECT 1` instead of a socket connect.
   Related: newer exasol-semantic-views dropped `tools/probe_ready.py` — made
   it optional (install.py already confirms readiness).

5. **Windows (passes 2–3) — the subtle one**: `tree_digest` sorted `Path`
   objects, and **pathlib compares casefolded on Windows but case-sensitively
   on POSIX**. Vendored trees mix case (LICENSE, README.md, UPSTREAM.txt beside
   lowercase), so Windows hashed the same files in a different ORDER → digest
   never matched the Linux-generated lock ("semanticViews vendored content
   differs"). EOL fixes (.gitattributes -text, core.autocrlf=false) could never
   fix it. Fix: sort by `file.relative_to(base).parts` — a tuple of strings,
   case-sensitive on every OS, and byte-identical to the historical POSIX
   ordering (verified locally on Python 3.12: parts-order == old posix order on
   both vendored trees, so all stored lock digests stayed valid; simulated
   Windows ordering of the old code provably diverged).

## Plus one repo setting
The final `commit` job pushed the candidate branch but PR creation failed:
"GitHub Actions is not permitted to create or approve pull requests". Fixed via
`gh api -X PUT repos/{repo}/actions/permissions/workflow -F
can_approve_pull_request_reviews=true`. First automated candidate PR: #34.

## Durable lessons
- **Port open ≠ service ready** behind Docker's proxy: always poll a real
  protocol-level handshake.
- **Never sort `Path` objects for anything hashed/cross-platform** — sort by
  `.parts` (or an explicit key). pathlib ordering is platform-dependent.
- Windows steps in shared workflows need explicit `shell: bash`.
- When changing a hash-input ordering, verify old==new on the reference
  platform BEFORE shipping, or you invalidate every stored digest.
- GitHub failed-step logs unlock only after the WHOLE run completes.
