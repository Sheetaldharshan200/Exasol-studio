# AI integrations — two directions, kept separate

Studio has TWO distinct MCP surfaces. Do not conflate them; each has its own
registry, UI, and security model.

## 1. Connectors → tools INTO the in-app agent

- Registry: agent-core `McpManager` (`mcp-servers.json`, secrets sealed via SecretBox).
- UI: the MCP sidepanel ("Connect external tools") + per-connector config tabs.
  Configured connectors leave the "Connectors" launcher list and gain an Edit button.
- Transports: **stdio** (local command) and **http** (StreamableHTTP with SSE
  fallback, headers sealed like env). Prefer remote HTTP servers — the in-app
  agent must stay **self-sustained**: never require Docker or a separately
  installed binary for a connector.

## 2. AI clients tab → the DATABASE out to other AI apps

- Marketplace → **AI clients** (`AiClientsTab.tsx` + Rust `ai_clients.rs`), the
  in-app equivalent of the starter kit's `exakit mcp-setup`.
- One click writes an `exasol` entry into the client's own MCP config (one-time
  `.exasol-backup` kept): bundled `exasol-mcp-server` + `EXA_DSN/EXA_USER/
  EXA_PASSWORD/EXA_SSL_CERT_VALIDATION=no`, using the dedicated `STUDIO_MCP_*`
  user — **read-only enforced by the database**, never the admin credential.
- JSON-config clients are auto-edited; TOML/odd-shaped configs (Codex, OpenCode)
  get copyable snippets instead — we never blind-rewrite non-JSON configs.
- Brand marks come from Simple Icons (CC0). OpenAI's and VS Code's marks were
  removed from Simple Icons over trademark policy → those clients use neutral
  glyphs, deliberately.

## Agent output fidelity (system prompt rules)

- The agent must NEVER show example/placeholder rows as if they were user data;
  every value shown must come from a tool result in the conversation. To preview
  loaded data: query it first.
- System prompts stay **generic** — no hardcoded dataset/table names from any
  real environment (use SCHEMA.TABLE_NAME-style placeholders).
- The chat renderer reflows tables a model collapsed onto one line
  (`reflowMarkdownTables` in AssistantPanel) — a rendering safety net, not a
  license to skip the fidelity rule.
