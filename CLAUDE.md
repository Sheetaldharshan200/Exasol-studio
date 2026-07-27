# Exasol Studio — agent & contributor instructions

Exasol Studio is a Tauri 2 (Rust) + React 19 / Vite / Tailwind v4 / shadcn
desktop Exasol client, with a Node `agent-core` AI sidecar. This file is loaded
by AI coding assistants (Claude Code, Cursor, Codex, Gemini CLI) working in this
repo — humans should read it too.

## Knowledge tools — use these, always

This project ships with knowledge tools. **Use them as the default way to
understand and record project knowledge**, so understanding compounds as the
project evolves instead of being re-derived every session. Setup: `./scripts/setup-knowledge-tools.sh`.

**Project-understanding questions → use the understand-anything graph FIRST.**
For any "how does this work / where does X live / how do these pieces fit /
what's the architecture" question, consult the committed
`understand-anything` knowledge graph (`.ua/knowledge-graph.json`) — it carries
per-file/function summaries, the architectural layer map, and a guided tour.
View it with `/understand-anything:understand-dashboard`, or read
`.ua/knowledge-graph.json` directly. **Always keep it current: after any code
or architectural change, refresh it** by re-running
`/understand-anything:understand` (it updates only changed files via the
committed `meta.json` + `fingerprints.json`) and commit the updated `.ua/`.
Do not let it drift — a stale graph is worse than none. Scope is the whole
repo (see `.ua/.understandignore`). This complements graphify: use graphify
for symbol/import/dependency queries, understand-anything for the layer map,
summaries, and onboarding tour. See `docs/knowledge-tools.md`.

1. **graphify** — a queryable knowledge graph of the whole codebase (AST-based,
   local, no vector store). For any question about architecture, where a symbol
   lives, or how files relate, **query graphify first** rather than blind
   grepping. The graph lives in `graphify-out/graph.json` — **committed** to the repo (the AST cache `graphify-out/cache/` is git-ignored).
   - Refresh: `graphify update .` (re-run after large changes; commit the updated graph.json)
   - `graph.json` is the **authoritative, queryable** source. `docs/codebase-graph.html`
     is a frozen visual snapshot (the graph outgrew the HTML viewer's node limit) —
     don't regenerate it; query graph.json instead.
   - In an AI assistant: the `/graphify` skill, or ask a codebase question.

2. **llm-wiki** — a persistent, growable Markdown knowledge base (an MCP server:
   `wiki_read`, `wiki_write_page`, `wiki_log_append`, `wiki_inventory`). Root:
   `knowledge/wiki/` (committed). **Record durable decisions, gotchas, and how-tos
   here** (e.g. "why dashboards persist at drag-stop", "the fastmcp/Obsidian
   incompatibility") so the next contributor/agent inherits them.

3. **obsidian-vault** — read/search/write Markdown notes in an Obsidian vault
   via a filesystem MCP (`knowledge/vault/`, committed). Use it for shared design notes and running logs.

Rule of thumb: **read** project knowledge from graphify (code) and llm-wiki
(decisions); **write** new durable knowledge back into llm-wiki as you learn it.

## Code quality workflow (mandatory)

- **Codex review before shipping**: after any substantive change, hand the
  diff to Codex for an independent code review + quality check (Claude Code:
  `/codex:rescue` or the `codex-rescue` subagent; CLI: `codex`). Apply valid
  findings before committing. Codex CLI is installed globally
  (`npm i -g @openai/codex`, ChatGPT auth).
- **KISS + SOLID**: the simplest thing that works, no speculative
  abstraction; single responsibility first when modules/classes are involved.
- **Unit tests with edge cases**: new logic gets tests covering the failure
  modes, not just the happy path — empty input, nulls, boundaries, Exasol
  identifier case-folding, error paths. A failing test or review finding is
  FIXED before shipping, never committed red.
- **Record findings**: notable review findings and their fixes go into the
  llm-wiki (`knowledge/wiki`) so the next contributor inherits them.

### KISS has three hard rules (not suggestions)

KISS is not only "avoid abstraction" — it is also a discipline about size,
reachability, and testability. These three are non-negotiable:

1. **Don't let a file reach 5,000 lines.** Split at ~500 lines. Over 1,000
   needs a stated reason in the PR. Nothing in this repo should ever approach
   5,000 again. A file that large is not "the main one", it is a landfill:
   nobody can review it, nothing in it is testable, and defects hide in it
   indefinitely. When adding to a big file, extract instead of appending.
   Known offenders to shrink, never grow — `ExasolStudio.tsx` (4,062, down
   from 5,089), `AssistantPanel.tsx` (2,090), `Dashboards.tsx` (2,086),
   `local_database.rs` (1,512), `tools.ts` (1,461), `loop.ts` (1,131).

   `ExasolStudio.tsx` breaks along seams that already exist. Extracted so far:
   `lib/sql-text.ts` (pure SQL text helpers — now unit-tested, which is the
   whole point of rule 3), `studio/tabs.ts` (the tab model),
   `studio/IconButton.tsx`, and `studio/HistoryDock.tsx` (run-status strip,
   results grid, git log, history dock). Still inline and extractable next:
   `TitleBar`, `ConnectionSection`, `VisualizerPanel`, `Sidebar`, `Selector`,
   `ConnectionSwitcher`.

2. **Don't ship code that can't run.** Unreachable code is a defect, not
   untidiness. After copy-pasting a block, verify the copy is actually
   reachable — in an `if (…) return …` chain, a duplicated earlier branch
   makes every later copy dead. Delete dead branches, unused exports, and
   commented-out blocks in the same change that orphans them. Precedent:
   `packages/agent-core/src/server.ts` carried ~350 unreachable lines
   (~40% of the file) from a route block pasted four times.

3. **Keep it small enough to test.** If new logic cannot be unit-tested
   without mounting the whole app, spawning a sidecar, or calling a live
   model, it is too big — extract the decision into a pure function and test
   that. Parsing, decoding, splitting, routing, and repair logic are always
   pure-function-shaped. "It's hard to test" is a design finding, not an
   excuse to skip the test.

### Running the tests

```bash
pnpm test              # everything: agent-core + sql-parser + Rust
pnpm test:coverage     # line/branch/function coverage for the logic core
```

Individually: `pnpm test:agent-core`, `pnpm test:parser`, `pnpm test:rust`.
During development: `pnpm --dir packages/agent-core test:watch`.

**No test framework, by design.** Tests use Node's built-in `node:test` +
`node:assert/strict` (Node 26 strips TypeScript natively) and Rust's
`#[cfg(test)]`. Zero dependencies, consistent with the rest of the repo
(`server.ts` and `tui.ts` are also framework-free). Do not add vitest/jest.

New test files are auto-discovered: name them `*.test.ts` next to the module
they cover (`src/foo.ts` → `src/foo.test.ts`).

Coverage is measured on the **pure logic core**, not the React tree — UI
wiring is expensive to cover and catches little. Current: `csv-import.ts`
100% lines, `tool-repair.ts` 98% lines, 100% functions across both. Keep new
pure modules at that level; don't chase a repo-wide percentage.

The way to make frontend logic testable is to pull it OUT of the component —
`lib/sql-text.ts` was extracted from a 5,000-line shell precisely so it could
be tested, and its tests mirror the Rust `split_statements` tests because the
two splitters must agree or "Run" sends something different from what the
server executes.

## Conventions that bite if ignored

- **Icons only, never emoji** in the app UI — use the central Boxicons registry
  (`apps/desktop/src/components/ui/boxicons.ts` + `<Icon>`) or `lucide-react`.
- **Theme-safe CSS**: theme variables are full colors (e.g. `--border: #dce3ee`),
  so use `var(--border)` / `color-mix(...)` — never `hsl(var(--border))`.
- **One codebase, every platform**: the frontend is a single build that runs in
  the Tauri desktop shell, on the web, and (future) Tauri Mobile. Platform
  differences live ONLY in the transport tiers of `apps/desktop/src/lib/ipc.ts`
  (Tauri IPC → `VITE_BACKEND_URL` HTTP → mock) — never fork per-platform UI.
  See `docs/web-deploy.md`.
- **Local build**: `EXASOL_PREBUNDLE=0 ./scripts/build-local.sh --bundles app`
  (run from repo root; the script masks pipe exit codes, so verify the built
  binary's mtime before relaunching).
- **Commits**: do not add a Co-Authored-By trailer. Releases are tag-triggered
  (`v*`); pushing to `main` does not publish.

See `docs/knowledge-tools.md` for the full setup + query guide.
