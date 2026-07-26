# Project knowledge tools

Exasol Studio uses three tools so knowledge about the codebase and its decisions
**compounds over time** — every contributor (human or AI assistant) reads from
and writes to the same shared understanding, instead of re-discovering it.

| Tool | What it holds | Read | Write |
|---|---|---|---|
| **graphify** | Knowledge graph of the codebase (files, symbols, relationships) | ✔ query it for architecture questions | auto — rebuild with `graphify extract .` |
| **llm-wiki** | Durable decisions, gotchas, how-tos (persistent Markdown KB) | ✔ `wiki_read`, `wiki_inventory` | ✔ `wiki_write_page`, `wiki_log_append` |
| **obsidian-vault** | Shared design notes / running logs (Markdown vault) | ✔ read/search | ✔ create/update notes |

## One-time setup

```bash
./scripts/setup-knowledge-tools.sh
```

That installs the tools (via `uv`) and registers them with any AI coding
assistants it detects. Or do it manually:

```bash
# 1. graphify — codebase knowledge graph + /graphify skill
uv tool install graphifyy
graphify install          # registers the /graphify skill with Claude Code, Cursor, Codex, Gemini
graphify update .         # build graphify-out/graph.json (COMMITTED; cache/ stays git-ignored)

# 2. llm-wiki — persistent project knowledge base (MCP server)
uv tool install llm-wiki-mcp
claude mcp add llm-wiki --scope user -- \
  "$HOME/.local/bin/llm-wiki-mcp" --wiki-root "$(pwd)/knowledge/wiki"

# 3. obsidian-vault — notes vault over the filesystem (no Obsidian app required)
mkdir -p knowledge/vault/.obsidian
claude mcp add obsidian-vault --scope user -- \
  npx -y @modelcontextprotocol/server-filesystem "$(pwd)/knowledge/vault"
```

Verify: `claude mcp list` should show `llm-wiki` and `obsidian-vault` as
**Connected**; `graphify-out/graph.json` should exist after `graphify update .`.

## How to use them (the working loop)

- **Understanding the code** → ask graphify (or `/graphify` in an assistant)
  before grepping. It knows call graphs, imports, and where things are defined.
- **A decision or non-obvious fact you just learned** → write it to **llm-wiki**
  (`wiki_write_page` / `wiki_log_append`). Examples worth recording: why a
  workaround exists, a subtle build/runtime gotcha, an architecture choice and
  its trade-offs. This is what makes the next session faster.
- **Longer design notes / logs you want to browse** → the **obsidian-vault**.

## Notes

- The knowledge is **shared in the repo**, not per-machine:
  `knowledge/wiki/` (llm-wiki root), `knowledge/vault/` (Obsidian vault) and
  `graphify-out/graph.json` (the codebase graph) are **committed**. Only the
  machine-local, regenerable bits are git-ignored: `graphify-out/cache/` and
  Obsidian's `.obsidian/` UI state. `graph.json` is set to **union-merge** via
  graphify's git merge driver (`.gitattributes`), so parallel edits don't
  conflict. Run `graphify update .` after code changes to refresh it.
- **Visual graph**: `docs/codebase-graph.html` is a **frozen snapshot** — a
  self-contained interactive view (vis-network inlined; works offline) from when
  the graph still fit the HTML viewer's node limit. The codebase has since
  outgrown it (~8k nodes), so the snapshot is intentionally NOT regenerated:
  `graph.json` is the authoritative source — query it (graphify / `/graphify`)
  instead of reading the HTML.
- The native Python `obsidian-mcp` package is currently broken against recent
  `fastmcp`; the filesystem MCP above is the reliable "vault as folder" path and
  needs no REST-API key or running Obsidian.

## understand-anything graph (`.ua/`) — committed & reusable

The `/understand-anything:understand` skill produces a second, complementary
knowledge graph under `.ua/` (dashboard-oriented: per-file/function summaries,
architectural layers, a guided tour). It is **committed to the repo** so it
reuses across machines/laptops — clone the repo and the graph is already there.

Committed (reusable): `knowledge-graph.json` (the graph), `meta.json`
(commit hash + timestamp — drives incremental updates), `config.json`
(language), `fingerprints.json` (structural baseline for incremental diffs),
`.understandignore` (scope/ignore rules), and `intermediate/scan-result.json`
(the file inventory, so incremental runs skip the SCAN phase). Machine-local
scratch (`.trash-*/`, `tmp/`, `*.log`) is git-ignored via `.ua/.gitignore`.

- **View it**: `/understand-anything:understand-dashboard` (starts the local
  Vite viewer at `http://127.0.0.1:5173/?token=…`).
- **Refresh after code changes**: re-run `/understand-anything:understand` —
  it reads `meta.json`'s commit hash and the fingerprints and re-analyzes only
  changed files (full re-analysis only on `--full`). Commit the updated `.ua/`.
- Scope is the **whole repo** (1262 nodes / 1425 edges across 12 layers):
  apps/desktop (UI + Tauri backend), packages/agent-core (+ vendored skills),
  packages/exasol-sql-parser, the semantic-views SQL layer, `.github/skills`
  (vendored design skill), CI/CD, docs/ADRs, knowledge bases, and tooling.
  Only generated/binary/vendored-runtime artifacts are excluded
  (`.ua/.understandignore`).
- This is distinct from graphify's `graphify-out/graph.json` (the AST-based
  import/call graph). Both are committed; use graphify for
  dependency/symbol queries, `.ua` for the layer map, tour, and summaries.
