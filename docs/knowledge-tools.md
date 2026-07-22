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
graphify extract .        # build the graph for this repo (writes graphify-out/, git-ignored)

# 2. llm-wiki — persistent project knowledge base (MCP server)
uv tool install llm-wiki-mcp
claude mcp add llm-wiki --scope user -- \
  "$HOME/.local/bin/llm-wiki-mcp" --wiki-root "$HOME/.exasol-studio-wiki"

# 3. obsidian-vault — notes vault over the filesystem (no Obsidian app required)
mkdir -p "$HOME/ExasolStudioVault/.obsidian"
claude mcp add obsidian-vault --scope user -- \
  npx -y @modelcontextprotocol/server-filesystem "$HOME/ExasolStudioVault"
```

Verify: `claude mcp list` should show `llm-wiki` and `obsidian-vault` as
**Connected**; `graphify-out/` should exist after `graphify extract`.

## How to use them (the working loop)

- **Understanding the code** → ask graphify (or `/graphify` in an assistant)
  before grepping. It knows call graphs, imports, and where things are defined.
- **A decision or non-obvious fact you just learned** → write it to **llm-wiki**
  (`wiki_write_page` / `wiki_log_append`). Examples worth recording: why a
  workaround exists, a subtle build/runtime gotcha, an architecture choice and
  its trade-offs. This is what makes the next session faster.
- **Longer design notes / logs you want to browse** → the **obsidian-vault**.

## Notes

- `graphify-out/` and the wiki/vault roots are **local, git-ignored** — the
  knowledge lives per-machine, seeded the same way for everyone via this doc.
  (If we later want a *shared* wiki, we can commit a `wiki/` folder and point
  `--wiki-root` at it — open question.)
- The native Python `obsidian-mcp` package is currently broken against recent
  `fastmcp`; the filesystem MCP above is the reliable "vault as folder" path and
  needs no REST-API key or running Obsidian.
