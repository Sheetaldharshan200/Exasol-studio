# Project knowledge (shared, in-repo)

This folder travels with the repo so **AI agents and humans get Exasol Studio's
accumulated knowledge directly**, no per-machine setup for the content itself.

- `wiki/pages/` — the **llm-wiki** knowledge base: durable decisions, gotchas,
  how-tos. The `llm-wiki` MCP is pointed here (`--wiki-root knowledge/wiki`), so
  what an agent writes lands in the repo and is reviewed like code.
- `vault/` — an **Obsidian vault** of design notes/logs (open the folder in
  Obsidian, or the `obsidian-vault` filesystem MCP reads/writes it here).
- `../graphify-out/graph.json` — the **graphify** codebase knowledge graph
  (committed; union-merged across contributors via graphify's git merge driver).
  Rebuild with `graphify update .`.
- `../docs/codebase-graph.html` — a **self-contained interactive HTML viewer**
  of the graph (open it in any browser; no server or internet needed).

Setup for a new contributor: `./scripts/setup-knowledge-tools.sh` (points the
MCPs at these in-repo folders). See `docs/knowledge-tools.md`.
