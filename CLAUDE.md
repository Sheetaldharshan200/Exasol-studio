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

## Conventions that bite if ignored

- **Icons only, never emoji** in the app UI — use the central Boxicons registry
  (`apps/desktop/src/components/ui/boxicons.ts` + `<Icon>`) or `lucide-react`.
- **Theme-safe CSS**: theme variables are full colors (e.g. `--border: #dce3ee`),
  so use `var(--border)` / `color-mix(...)` — never `hsl(var(--border))`.
- **Local build**: `EXASOL_PREBUNDLE=0 ./scripts/build-local.sh --bundles app`
  (run from repo root; the script masks pipe exit codes, so verify the built
  binary's mtime before relaunching).
- **Commits**: do not add a Co-Authored-By trailer. Releases are tag-triggered
  (`v*`); pushing to `main` does not publish.

See `docs/knowledge-tools.md` for the full setup + query guide.
