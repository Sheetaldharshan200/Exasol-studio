# Exasol Studio — agent & contributor instructions

Exasol Studio is a Tauri 2 (Rust) + React 19 / Vite / Tailwind v4 / shadcn
desktop Exasol client, with a Node `agent-core` AI sidecar. This file is loaded
by AI coding assistants (Claude Code, Cursor, Codex, Gemini CLI) working in this
repo — humans should read it too.

## Knowledge tools — use these, always

This project ships with three knowledge tools. **Use them as the default way to
understand and record project knowledge**, so understanding compounds as the
project evolves instead of being re-derived every session. Setup: `./scripts/setup-knowledge-tools.sh`.

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
