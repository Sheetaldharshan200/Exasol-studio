
## 2026-07-23 — marketplace redesign + AI integrations
- Marketplace: horizontal tabs (Kits first → Catalog → Updates/Installing/Installed → Categories ▾ → AI clients); kit contents modal with top-right + install; raw icons.
- AI clients tab: one-click Exasol MCP into Claude/Cursor/Copilot/Gemini configs (backup kept), snippets for Codex/OpenCode; read-only STUDIO_MCP_* identity. Separate from in-app connectors — see wiki/pages/ai-integrations.md.
- agent-core: HTTP MCP transport (StreamableHTTP + SSE fallback) — self-sustained, no Docker.
- Agent prompt: no fabricated sample rows; prompts genericized (no real dataset names). Chat: collapsed-table reflow, no stream caret.
- Schema visualizer icon → ER-diagram glyph.
