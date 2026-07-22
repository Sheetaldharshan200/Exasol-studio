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
- **Visual graph**: open `docs/codebase-graph.html` in a browser — a
  self-contained interactive view of the whole codebase graph (vis-network
  inlined; works offline). Regenerate with
  `GRAPHIFY_VIZ_NODE_LIMIT=10000 graphify cluster-only . --no-label` then copy
  `graphify-out/graph.html` over it.
- The native Python `obsidian-mcp` package is currently broken against recent
  `fastmcp`; the filesystem MCP above is the reliable "vault as folder" path and
  needs no REST-API key or running Obsidian.
