# AGENTS.md — Exasol Studio

Cross-tool agent instructions (Codex, Cursor, Gemini CLI, Claude Code, …).
**`CLAUDE.md` is the full, authoritative version — read it.** This file is the
short standard-named pointer plus the non-negotiable always-rules.

Exasol Studio is a Tauri 2 (Rust) + React 19 / Vite / Tailwind desktop Exasol
client with a Node `agent-core` AI sidecar, an ANTLR `exasol-sql-parser`, and a
database-side `exasol-semantic-views` SQL layer.

## Understand the project — use the knowledge graphs FIRST

- **Project-understanding questions** ("how does X work", "where does Y live",
  "how do these fit", "what's the architecture") → consult the committed
  **understand-anything** graph `.ua/knowledge-graph.json` first (per-file /
  function summaries, architectural layer map, guided tour). View it with
  `/understand-anything:understand-dashboard`.
- **Symbol / import / dependency queries** → query **graphify**
  (`graphify-out/graph.json`, or the `/graphify` skill).
- Both graphs are committed and reusable across machines — no re-analysis
  needed after cloning.

## Keep the graphs current — ALWAYS, after code or architectural changes

A stale graph is worse than none. After any code or architectural change:

1. `/understand-anything:understand` — refreshes `.ua/` incrementally (only
   changed files, via the committed `meta.json` + `fingerprints.json`); commit
   the updated `.ua/`.
2. `graphify update .` — refreshes `graphify-out/graph.json`; commit it.

Do this as part of the change, not "later". Scope for understand-anything is
the whole repo (`.ua/.understandignore`).

## Code quality (mandatory)

- After substantive changes, get an independent **Codex review**
  (`/codex:rescue` or the `codex` CLI); apply valid findings before committing.
- **KISS + SOLID**; no speculative abstraction.
- **Unit tests with edge cases** (empty/null/boundary, Exasol identifier
  case-folding, error paths). Fix reds before shipping — never commit red.
- Record durable findings/decisions in the **llm-wiki** (`knowledge/wiki/`).

### KISS — three hard rules

1. **Don't let a file reach 5,000 lines.** Split at ~500; over 1,000 needs a
   stated reason. Extract, don't append. Shrink the known offenders
   (`ExasolStudio.tsx`, `AssistantPanel.tsx`, `Dashboards.tsx`,
   `local_database.rs`, `tools.ts`, `loop.ts`), never grow them.
2. **Don't ship code that can't run.** Unreachable code is a defect. After a
   copy-paste, verify the copy is reachable — in an `if (…) return` chain a
   duplicated earlier branch makes later copies dead. Delete dead branches and
   commented-out blocks in the change that orphans them.
3. **Keep it small enough to test.** If logic needs the whole app, a sidecar,
   or a live model to test, it's too big — extract a pure function and test
   that. "Hard to test" is a design finding, not a reason to skip the test.

## Conventions that bite

- **Icons only, never emoji** in app UI (Boxicons registry or `lucide-react`).
- Theme-safe CSS: use `var(--token)` / `color-mix(...)`, never `hsl(var(--…))`.
- One codebase, every platform: platform differences live only in the
  transport tiers of `apps/desktop/src/lib/ipc.ts`.
- Commits: no Co-Authored-By trailer. Releases are tag-triggered (`v*`).

See `CLAUDE.md` and `docs/knowledge-tools.md` for the full detail.
