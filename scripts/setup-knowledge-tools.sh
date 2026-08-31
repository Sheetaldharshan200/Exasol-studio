#!/usr/bin/env bash
# Set up Exasol Studio's project knowledge tools — graphify (codebase graph),
# llm-wiki (persistent decisions KB) and an Obsidian-style notes vault — and
# register them with AI coding assistants. Safe to re-run. See
# docs/knowledge-tools.md for what each one is and how to use it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

need() { command -v "$1" >/dev/null 2>&1 || { echo "!! missing '$1' — install it first"; exit 1; }; }
need uv
need claude

echo "==> graphify (codebase knowledge graph)"
uv tool install graphifyy >/dev/null 2>&1 || uv tool upgrade graphifyy >/dev/null 2>&1 || true
graphify install >/dev/null 2>&1 || true
( cd "$ROOT" && graphify update . >/dev/null 2>&1 ) && echo "   graph built -> graphify-out/graph.json (committed)" || echo "   (graphify update skipped/failed — run it manually)"
git config merge.graphify.driver "graphify merge-driver %O %A %B" 2>/dev/null || true

echo "==> llm-wiki (persistent project KB)"
uv tool install llm-wiki-mcp >/dev/null 2>&1 || true
WIKI="$ROOT/knowledge/wiki"; mkdir -p "$WIKI/pages"
claude mcp add llm-wiki --scope user -- "$HOME/.local/bin/llm-wiki-mcp" --wiki-root "$WIKI" >/dev/null 2>&1 \
  && echo "   registered MCP: llm-wiki -> $WIKI" || echo "   (llm-wiki already registered)"

echo "==> obsidian-vault (notes vault over the filesystem)"
VAULT="${OBSIDIAN_VAULT:-$ROOT/knowledge/vault}"; mkdir -p "$VAULT/.obsidian"
[ -f "$VAULT/Welcome.md" ] || printf '# Exasol Studio Vault\n\nShared Markdown notes for the project.\n' > "$VAULT/Welcome.md"
claude mcp add obsidian-vault --scope user -- npx -y @modelcontextprotocol/server-filesystem "$VAULT" >/dev/null 2>&1 \
  && echo "   registered MCP: obsidian-vault -> $VAULT" || echo "   (obsidian-vault already registered)"

echo
echo "Done. Verify with:  claude mcp list   (llm-wiki + obsidian-vault should be Connected)"
echo "Read the workflow:  docs/knowledge-tools.md"
