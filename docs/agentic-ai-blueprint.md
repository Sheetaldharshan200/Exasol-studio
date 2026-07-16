# Exasol Studio — Agentic AI Blueprint

Direction: replace the single-shot Anthropic chat (`ai.rs` + `AssistantPanel.tsx`) with a
production agentic AI system that is Exasol-exclusive, local-model-first, and ships both
inside the app and as a standalone CLI. Superset is removed and replaced by our own
agent-editable BI module.

All research verified July 2026. Everything we reuse is MIT-licensed.

---

## 1. Module layout (separate module, shippable as CLI)

Follow the opencode pattern (MIT — patterns and code copyable): **everything is a client
of one headless core.**

```
packages/agent-core/          # TypeScript. The entire agent, headless.
  src/server/                 #   HTTP + SSE API (OpenAPI spec), localhost only
  src/provider/               #   AI SDK + models.dev registry, transform quirks
  src/session/                #   agent loop, compaction, permissions
  src/tools/                  #   Exasol tools (metadata, query, profile, KB, BI, UI)
  src/kb/                     #   graph knowledge base (SQLite)
  src/driver/                 #   exasol-driver-ts (native WebSocket, MIT)
  skills/                     #   vendored exasol-agent-skills markdown (pinned)
  data/                       #   exasol_builtin_functions.json (152 KB), grammar EBNF,
                              #   reserved keywords — from exasol/mcp-server (MIT)
packages/agent-cli/           # `exa-agent` — Bun-compiled single binary; embeds core
packages/bi/                  # dashboard renderer: ECharts 6 + Perspective + grid
apps/desktop/                 # Tauri app = thin client; spawns agent-core as sidecar
```

- **Desktop:** Tauri spawns the compiled agent-core binary as a sidecar; the React panel
  talks HTTP + SSE. Connection credentials never enter the agent config — the Rust vault
  hands the sidecar a per-session DSN over stdin at spawn.
- **CLI:** the same binary with a terminal chat UI (`exa-agent`), connecting with a DSN.
  One codebase, two shells — exactly opencode's proven split.
- Permission prompts are **async server→client events over SSE** (approve/deny round
  trip), so both GUI and CLI get identical human-in-the-loop behavior.

## 2. Providers — local-first, all providers supported

Stack confirmed from opencode source:

- **Vercel AI SDK** (`ai` + `@ai-sdk/*`) as the runtime abstraction.
- **models.dev `api.json`** as the model catalog (context window, `tool_call` flag, cost,
  modalities) — cached locally with a compiled-in snapshot fallback for offline use.
- **Local models are the headline:** `@ai-sdk/openai-compatible` pointed at
  Ollama (`http://localhost:11434/v1`), LM Studio (`:1234/v1`), llama.cpp (`:8080/v1`).
  On startup we **auto-detect Ollama** (`GET /api/tags`) and list installed models with
  zero config — that's the "magic" moment.
- Provider registry = merge of: catalog → user config (`agent.json`) → env vars →
  stored auth. Any provider with an AI SDK adapter is one config line away (75+).
- A single `transform.ts`-style quirks module normalizes tool-call IDs, JSON-schema
  sanitization, temperature defaults per model family (verbatim pattern from
  `opencode/src/provider/transform.ts` — the most reusable file in their repo).
- Per-model-family system prompts (anthropic / gpt / gemini / small-local), with a
  compact "beast-mode" prompt for weak local models.

## 2.1 Built-in local engine — no Ollama required

Decision: ship a **managed `llama-server` sidecar**, not FFI-embedded llama.cpp.

- llama.cpp publishes prebuilt `llama-server` binaries per platform (macOS arm64
  +Metal included); the server speaks the OpenAI-compatible API with tool calling
  (`--jinja`), which our `llamacpp` provider already consumes.
- Same on-demand pattern as driver runtimes: engine binary downloads from llama.cpp
  GitHub releases into `driver-runtimes/llm/`; GGUF models download from Hugging Face
  (curated, tool-call-capable list: Qwen3-coder / Qwen2.5-Instruct 7B, Llama-3.2-3B
  for small machines) with resumable progress via the Marketplace queue.
- Rust `local_llm.rs` manages download / spawn / health / port; agent-core
  auto-registers it as the "builtin" provider. AI Providers window gets a
  "Built-in local AI" card: pick model → download → chat. Offline, zero deps.
- Why not FFI (llama-cpp-2 / mistral.rs / Candle): per-platform native build matrix,
  in-process crashes kill the app, engine upgrades locked to app releases.
- Ollama / LM Studio remain supported as bring-your-own options.

## 2.2 exasol-compass (org alignment)

`ranjanm-chn/exasol-compass` (leadership; Python, MCP server + CLI) builds a
persistent schema knowledge graph and serves it over MCP with tools
`get_neighbors` / `shortest_path` / `god_nodes` / `graph_stats` / `query_graph`
+ token-savings reporting. It is the SAME design as our in-app KB
(`agent-core/kb.ts`), which independently converged on it:

| compass | Ada's KB |
|---|---|
| query_graph | kb_search |
| shortest_path | kb_join_path |
| god_nodes | hubs() |
| graph_stats (communities) | subsystems() |
| get_neighbors / get_columns | table cards / describe_table |
| system-schema filtering | isInternal() |

**Final architecture (2026-07-16) — one graph, KB is the single source:**
Ada uses the native KB for EVERY model (local and cloud) — per-turn RAG
injection + kb_* tools, identical behavior, no drift, one code path. The
earlier cloud→compass / local→KB split was retired (it gated on the wrong
axis and created two schema representations). compass is positioned by its
real strengths:
- **External CLI agents** (Claude Code / Codex) — its design and audience; the
  org standardizes on compass there.
- **Optional KB backend (planned):** compass extracts → KB stores/injects, via
  a documented import path (`KnowledgeGraph` load from an external graph). Ada
  still serves it the same way. To be wired when we can verify against a real
  compass graph — we don't ship a blind graph.json parser.

**Original notes — complementary, not competing:**
- **exasol-compass** is aimed at *external* CLI agents (Claude Code, Codex CLI)
  as a standalone MCP server — its real audience. The org standardizes on it
  there.
- **Ada (Studio's embedded agent)** keeps the native KB as default: no extra
  process, per-turn RAG injection (stronger than on-demand lookup for small
  local models), already token-optimized, offline. Naming/approach are kept
  consistent with compass so it's one mental model.
- **Opt-in bridge (planned):** an OFF-by-default setting to point Ada at a
  running compass MCP server and use its tools in place of the native KB, for
  orgs that want a single graph source. Requires adding an MCP client
  dependency + a reachable compass endpoint to build and verify — deferred
  until we can test it end-to-end (won't ship blind into the agent loop).

## 3. Exasol knowledge — what we vendor (all MIT)

| Source | What we take |
|---|---|
| `exasol/mcp-server` | Port `meta_query.py` SYS-catalog SQL → TS tools (list/find/describe/summarize schemas, tables, functions, UDFs); `profile_exasol_query` flow (`ALTER SESSION SET PROFILE='ON'` → `FLUSH STATISTICS` → `EXA_USER_PROFILE_LAST_DAY`); `exasol_builtin_functions.json` (152 KB machine-readable); its 7 SKILL.md files |
| `exasol-labs/exasol-agent-skills` | ~200 KB markdown knowledge base: **EBNF grammar** (the source of docs.exasol.com syntax diagrams), reserved keywords (2026.1.0), dialect quirks, QUALIFY/window functions, table design (DISTRIBUTE/PARTITION BY), profiling, import/export — bundled pinned, loaded as skills |
| `exasol-labs/exasol-vscode` | Mine for metadata queries + `exasol-driver-ts` usage patterns |
| `exasol-labs/exasol-semantic-views` | Pinned first-run install into the Studio-managed local database; readiness-gated analyst skill plus `semantic_compile_request` / `semantic_compile_sql` tools |

The desktop uses the Personal Local Starter Kit only as design reference. Runtime and
component orchestration are implemented inside Studio: native Exasol Personal on macOS,
Exasol Nano through Docker/Podman on Windows/Linux, and pinned first-install PyExasol,
ExaPump, MCP server, Semantic Views, and agent skills. Semantic Views readiness plus its
managed profile id is written to `agent/capabilities.json`. Agent-core reads
that marker on every turn: physical discovery remains available during setup, and the
semantic-first contract/tools become active only after the database installer reports
success and that exact profile is active. `Sahir619/fable-method` is pinned as the default
always-active work method; workspace instructions and user skill overrides still take precedence.

SQL safety guard: classify statements (SELECT auto-run with LIMIT wrap; DML/DDL/DCL
always gated behind approval). Exasol has no EXPLAIN — profiling is the mechanism, and
we ship it as a first-class tool.

## 4. Graph knowledge base (the accuracy engine)

Local models can't hold a 400-table schema in context. The KB gives them a precise,
tiny slice instead.

- **Store:** SQLite (nodes, edges, FTS5 for keyword search) inside agent-core — ships
  with the CLI too. Optional embeddings via Ollama later. (Upgrade path: Kuzu.)
- **Nodes:** schema → table/view → column; queries; dashboards; connections.
- **Edges:** structural (PK/FK from `EXA_ALL_CONSTRAINTS`, view deps from
  `EXA_ALL_DEPENDENCIES`), inferred (join pairs mined from query history, name/type
  similarity), usage (query→tables, dashboard→queries, table heat).
- **Build:** incremental crawl on connect + after DDL.
- **Agent tools:** `kb_search(question)` → entry nodes + k-hop join subgraph (a few
  hundred tokens), `kb_join_path(a, b)`, `kb_table_card(table)` (columns + stats +
  sample values from `summarize`).
- Bonus: the same graph powers a visual schema map in the UI later.

## 5. BI module — Superset removed

Superset is deleted (SupersetTab, market entry, `bi-superset` recipes, superset window
capability, market.rs code). Replacement — all in-webview, no Python, no login:

- **Charts:** Apache ECharts 6 (Apache-2.0, ~100 KB tree-shaken) — whole chart is one
  JSON `option`; we constrain the agent to a validated subset (JSON Schema + repair
  loop), data rows injected by us, never written by the model.
- **Pivot/table:** FINOS Perspective 4.x (Apache-2.0, Rust/WASM) — **ingests Arrow IPC
  straight from our Rust query engine**, pivots millions of rows client-side.
- **Layout:** react-grid-layout v2 — layout is `[{i,x,y,w,h}]` JSON.
- **Spec:** our own thin, Grafana-shaped dashboard JSON (`*.dash.json` in workspace):

```json
{ "version": 1, "title": "...", "theme": "auto",
  "variables": [{"name": "region", "type": "select", "query": "..."}],
  "panels": [
    {"id": "p1", "grid": {"x":0,"y":0,"w":6,"h":8},
     "query": {"sql": "SELECT ..."},
     "viz": {"type": "echarts", "option": { }}},
    {"id": "p2", "grid": {}, "query": {}, "viz": {"type": "kpi", "format": "$0.0a"}},
    {"id": "p3", "grid": {}, "query": {}, "viz": {"type": "perspective", "config": {}}}
  ],
  "interactions": [{"source": "p1", "event": "click:seriesName", "sets": "region"}] }
```

Panel `viz` variants map 1:1 to each engine's native JSON, so we invent almost nothing.
Agent tools: `dashboard_create`, `dashboard_edit_panel`, `dashboard_run` — schema-
validated, versioned as plain files (diffable, git-friendly, human-editable).

## 6. The pet — GUI agent with cursor magic

A visible agent cursor that *does things in the app*, always under user control.

- **UI action registry:** interactive elements get `data-agent-id` anchors
  (`save-query`, `open-bi`, `tab:<id>`, `run-query`…). Frontend registers a typed
  command map; agent-core exposes them as `ui_*` tools.
- **Cursor overlay:** Framer Motion layer animates a glowing cursor from its current
  position to the anchor, pulses, then dispatches the real action. Narration chip shows
  what it's doing ("Saving query…").
- **Every `ui_*` call flows through the permission system** — in Ask mode the cursor
  moves to the target and waits with an Approve/Deny chip before acting.

## 6.1 Orchestration: hand-rolled loop — explicitly NOT LangChain/LangGraph

Decision: no agent framework. opencode, Claude Code, and Codex CLI all use a plain
hand-written loop; the core is ~200 lines (`streamText` → execute tool calls behind the
permission gate → append results → repeat until no tool calls). Rationale:

- LangChain/LangGraph wrap everything in chains/graphs/runnables — debugging crosses
  five framework layers, and the ecosystem has notorious breaking-change churn.
- We'd use ~5% of it. LangGraph's real value (multi-agent state machines,
  checkpointing) doesn't apply: we are one agent + tools, and checkpointing is our
  SQLite session store anyway.
- The genuinely hard part — provider abstraction — is outsourced to the AI SDK +
  models.dev. The loop, permissions, and tools stay ours: small, deterministic,
  greppable. That is the maintenance strategy.

## 6.2 Logs & observability (local-first)

- **Session transcripts as JSONL** — one file per session in the app data dir: every
  LLM request/response, tool call + args + result + duration, permission decision,
  token counts and cost (from models.dev pricing). Append-only, replayable, exportable.
- **pino** structured logger in agent-core (JSON, daily rotation). One logger, levels.
- **In-app Activity view** renders the JSONL live: timeline of tool calls, expandable
  args/results, per-session token/cost meter. Doubles as the user-facing audit trail.
- **CLI:** `exa-agent logs` tails the same files — identical format everywhere.
- Optional later: OpenTelemetry/Langfuse exporters. Default is 100% local files.

## 6.3 Cursor implementation details (smoothness contract)

- Single `AgentCursor` overlay at the app root, `position: fixed`, animated ONLY with
  `transform: translate3d` via Framer Motion springs (stiffness ~120, damping ~20) —
  GPU-composited, no layout thrash, 60fps under load.
- `useAgentAnchor` hook registers `data-agent-id` elements in a live map. Tool call →
  resolve anchor → `scrollIntoView` if off-screen → wait for settle → spring to rect
  center.
- Visual state machine: idle → moving → hovering (glow) → awaiting-approval (pulse +
  Approve/Deny chip anchored to cursor) → clicking (ripple) → done. Narration chip
  follows the cursor ("Saving query…").
- The click is real: after landing, dispatch the registered command handler (same code
  path as the button) — never a synthetic DOM click.
- `prefers-reduced-motion` → fade-teleport instead of glide. Esc cancels mid-flight and
  aborts the tool call.

## 7. Human-in-the-loop permission model

opencode-style ruleset, per scope, each `allow | ask | deny`:

- `db.read` (SELECT — default allow, LIMIT-wrapped) · `db.write` (DML/DDL — default ask)
- `ui.act` (pet actions — default ask) · `fs` (workspace files) · `bi.edit`
- **Modes** are just rulesets: **Plan** (read-only, produces a plan, edit/write/ui all
  ask), **Ask** (default), **Auto** (user-granted allowlist).
- Doom-loop detection (N identical tool calls → forced interrupt) — verbatim from
  opencode's processor.

## 8. Phases

1. **Core skeleton** — agent-core server (HTTP+SSE, sessions, agent loop), AI SDK
   providers + models.dev, Ollama autodetect, new streaming chat panel replacing
   `ai.rs`/old panel. *Chat with any provider or local model, streaming, in-app.*
2. **Exasol tools** — driver, ported metadata tools, run_sql with guard + approval flow,
   profile tool, bundled skills + dialect data. *Accurate SQL answering/building.*
3. **Graph KB** — crawler, SQLite graph, kb_* tools wired into the loop. *Local models
   get fast + precise.*
4. **BI module** — packages/bi renderer, dashboard spec + tools, **remove Superset**.
   *"Build me a revenue dashboard" → live dashboard tab.*
5. **The pet** — action registry, cursor overlay, ui_* tools, permission modes UI.
6. **CLI** — Bun-compiled `exa-agent` binary, config file, release pipeline.
