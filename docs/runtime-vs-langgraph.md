# Exa's agent runtime vs LangChain / LangGraph / LangSmith

**Status: FULLY MIGRATED to the LangChain ecosystem (2026-07-17) — one stack.**

Two-phase migration, both eval-refereed:

**Phase 1 — orchestration → LangGraph.js** (`src/graph.ts`): the turn is a
`StateGraph`: `START → attempt → (recover | continuation | finalize)` — the
reliability ladder that used to be `if` blocks is explicit nodes with
conditional edges and `Command(goto)` transitions.

**Phase 2 — model I/O → LangChain** (`src/llm.ts`, AI SDK fully removed):
`ChatAnthropic` / `ChatOpenAI` / `ChatGoogleGenerativeAI`, with all local +
custom endpoints (builtin llama-server, Ollama, LM Studio, In-Database) via
`ChatOpenAI` + `configuration.baseURL`. Our `runLoop()` owns the agentic step
loop: `bindTools` (zod schemas) → stream/invoke → execute calls in parallel →
`ToolMessage` → repeat. The deterministic repair layer moved INSIDE the loop —
unknown tool names resolve through the alias table, aliased/malformed args
repair before execution, and LangChain's `invalid_tool_calls` (unparseable
JSON) go through the same pipeline. That replaces the AI SDK's experimental
`repairToolCall` hook with code we fully own — repair is now a first-class
loop feature, not a vendor hook. Session history is `BaseMessage`
(`StoredMessage` serialization for checkpoints).

**Deliberately kept ours:**
- **Durability** (`Session.checkpoint` → `turn.json` + recovery): LangGraph's
  SQLite checkpointer needs `better-sqlite3` (native module) — would break the
  single-file zero-native sidecar. Ours is eval-tested and equivalent here.
- **All external contracts** — server, app panel, CLI: zero changes.

**Acceptance (measured):** 47/47 deterministic evals, 4/4 live-model evals
(builtin Qwen2.5-Coder-7B), CLI smoke (streamed turn + native tool call).
Bundle: 2.5 MB (AI SDK era) → 4.7 MB (full LangChain stack), single-file, no
native deps. Known trade recorded honestly: reasoning-delta streaming
(llama.cpp thinking tokens) is not surfaced by the LangChain OpenAI client the
way the AI SDK did — reasoning display in the UI is inert until wired to
`additional_kwargs.reasoning_content`.

**What this buys (the "specialties" the migration was for):** any LangChain
tool/retriever/agent pattern is now native; new agents are graph nodes +
`ToolSet` entries; LangGraph prebuilts and LangSmith tracing can be adopted
without another model-layer migration.

One important correction from the research: **LangChain/LangGraph have no
official Rust support** — Python and JS only (both v1.0, Oct 2025). Rust has
community imitations (`langchain-rust`, `graph-flow`, AutoAgents) that are
less maintained than our own code; a Rust rewrite was rejected on exactly the
maintainability grounds that motivated the migration. Rust keeps its real
jobs: the Tauri shell, vault, sidecar lifecycle, native OS work.

The original comparison that informed the decision follows.

---

## 1. The three tools are different questions

| Tool | What it actually is | Our counterpart |
|---|---|---|
| **LangChain** | Model/provider abstraction, chains, retrievers, output parsers | **Vercel AI SDK v5** (providers, tool loop, streaming, repair hooks) + native KB retrieval |
| **LangGraph** | Stateful graph runtime: checkpointing, interrupts, fan-out, streaming | Our `runTurn` loop + Session checkpointing + TurnBoard + rescue ladder |
| **LangSmith** | SaaS observability: traces, token costs, eval datasets | JSONL transcripts + **47-case deterministic eval bank + live-model eval tier**, both CI-gated |

Arguing "LangChain vs nothing" is a strawman in both directions. The honest
comparisons are per-row below.

## 2. LangGraph 1.2 vs our runtime — feature by feature

Verdicts assume THIS product: local-first desktop + CLI, TS-native, small local
models as the primary target, single-user, database side effects.

| Capability | LangGraph (per docs) | Ours (today) | Verdict + edge case |
|---|---|---|---|
| **Durable execution** | Every transition checkpointed (Memory/SQLite/Postgres); resume re-executes the interrupted node | Per-step checkpoint (`sessions/<id>.turn.json`, cumulative snapshot verified against ai@5.0.211 source); crash → revive folds completed steps + "[Recovered]" note | **Parity, different semantics — ours is safer here.** Their resume *re-executes the interrupted node from its start*; their own docs require side-effect idempotency. Re-running half a DDL sequence on a real database is exactly what we must not do. We recover *state* and continue on the user's word. Eval-tested (crash → revive → no duplication, no double recovery) |
| **Interrupts (HITL)** | `interrupt()` persists across restarts (checkpointer + thread id) | Permission gate over SSE; **pending asks now survive restarts as re-asks** ("Drop schema STAGING — it did NOT run … re-run on approval"); never auto-executes | **Parity.** Their durable interrupt resumes execution with the answer; ours re-asks through the normal gate. For destructive SQL, re-ask is the correct bias. Eval-tested |
| **Fan-out (Send API)** | Deterministic map-reduce: code decides N branches, join semantics | Model-issued parallel tool calls (SDK executes a step's calls concurrently) + **TurnBoard** shared typed state; researchers stream live (`↳ run_sql ⎿ 42 rows`) | **Depends on who decides N.** Ours is model-driven — right when decomposition IS the task ("build me a dashboard"). Theirs wins for code-driven pipelines (fan out over exactly these 500 tables). We have no ETL surface yet; the day we do, a worklist + `Promise.all` is ~30 lines here |
| **Streaming** | Graph-level modes (values/updates/messages/custom), per-node visibility | Full SSE vocabulary; per-step tool events; **subagent inner steps stream live** as of 2026-07-17 | **Parity** for everything our surfaces render |
| **Time travel** | Inspect/modify/replay any prior state; fork branches | Transcripts inspect everything; **`/undo`** rewinds one exchange (audit + side effects stay honest); no forkable replay | **They win.** `/undo` covers the daily use case; "rewind to step 3 and branch" doesn't exist here. Future work if debugging ever demands it — our eval bank covers the *regression* need differently |
| **Retry policies** | Declarative per-node retries/timeouts/compensation | Targeted: driver reconnect-retry, deterministic tool-call repair, text-call rescue, phantom-tool correction, mid-plan resume, doom-breaker, 30-step hard budget | **Different philosophy.** Theirs is generic (good for many teams × many node types). Ours is aimed at the failures we've actually captured — and *those* failure classes (below) are ones no generic retry policy addresses |
| **Cross-thread memory (Store)** | Namespaced key-value store | MemoryStore (user/project, soft-cap forgetting) + schema KB + board findings → memory | Parity for this domain |
| **Subgraphs** | Arbitrary nested composition | Supervisor + one level of researchers, deliberately capped | **They win in generality.** Nesting subagents under a 7B supervisor is a reliability trap we chose not to open. Revisit with stronger local models |

## 3. LangChain vs Vercel AI SDK (the real "chains" question)

- Both give provider abstraction, tool calling, streaming, structured output.
- AI SDK is TS-native and the ecosystem opencode ships on; LangChain's center
  of gravity is Python — LangChain.js trails it.
- Stacking LangChain on top of AI SDK would mean two competing abstractions
  over the same providers — strictly worse than either alone.
- What LangChain has that AI SDK lacks (big retriever/loader zoo) we don't
  need: our retrieval is the native KB (SQLite/FTS5 graph), purpose-built for
  Exasol schemas, injected per turn.

## 4. LangSmith vs our observability

- **Their win**: polished trace UI, token/cost analytics, hosted eval datasets,
  team sharing.
- **The conflict**: this product's promise is *local-first* — schemas, SQL and
  data samples never leave the machine. LangSmith is a SaaS; self-hosting is
  enterprise-priced.
- **Our answer**: JSONL transcripts (every call, repair, rescue, permission is
  recorded) + the eval harness:
  - `pnpm --filter @exasol-studio/agent-core evals` — 47 deterministic cases,
    each citing a real field incident; gates `release-app.yml`.
  - `pnpm … evals:live [model]` — real turns against a real local model
    (instruction-following, actual tool invocation, honest empty answers,
    document grounding). 4/4 on builtin Qwen2.5-Coder-7B at adoption.
- Rule: **a new field failure gets an eval case before its fix.** That is the
  part of LangSmith we actually needed, without the cloud.

## 5. The empirical evidence (why the frameworks don't solve our problem)

Every real failure captured in the field lives **below the graph layer** — in
what the model emits, not in how nodes are wired:

| Incident | Layer | Would LangGraph have caught it? |
|---|---|---|
| Invented `EXA_PUMP` / `SYS.EXA_ATTACHED_FILES` plan | model output | No — it assumes valid tool calls |
| Tool call written as text (`{"name": "search_documents"…}`), turn dead-ends | chat-template | No — same assumption |
| Phantom `ui_connect` while UI tools disabled | prompt/tool contract | No |
| Turn stops mid-plan ("I'll now move on…") | model generation | No |
| Hallucinated CSV columns after an empty search | tool ergonomics | No |

The fixes (deterministic repair, text-call execution, phantom correction,
continuation enforcement, forgiving document search) had to be custom in any
framework — and here they are 47 replayable tests, not folklore.

## 6. Where they still genuinely win (kept honestly on the board)

1. **Transcript-forking time travel** — `/undo` is the primitive; full
   branch-and-replay is future work.
2. **Declarative Send-API fan-out** — build when an ETL/pipeline surface
   exists (~30 lines in this codebase).
3. **Ecosystem & hiring** — LangGraph is a lingua franca; our loop requires
   reading `loop.ts`. Mitigation: this document + the blueprint + eval cases
   double as the spec.
4. **Managed platform** (LangGraph Platform) — irrelevant while we ship a
   desktop sidecar; relevant if we ever host a multi-tenant agent service.

## 7. Revisit triggers

Re-open this decision if any of these become true:

- We ship a **server-side multi-tenant** agent service (their platform,
  Postgres checkpointers and horizontal scaling start paying rent).
- We need **Python-side agents** (in-DB data science integration) — LangGraph
  Python is the natural runtime there and can speak to the KB over MCP/compass.
- Local models become strong enough that **nested subagent graphs** are
  reliable — their subgraph composition beats growing our one-level design.
- The team grows past the point where "read loop.ts" onboards an engineer.

## Sources

- LangGraph interrupts: <https://docs.langchain.com/oss/python/langgraph/interrupts>
- `interrupt` reference (resume semantics, idempotency): <https://reference.langchain.com/python/langgraph/types/interrupt>
- LangGraph TS guide (2026): <https://baeseokjae.github.io/posts/langgraph-typescript-guide-2026/>
- LangGraph vs LangChain (2026): <https://www.spheron.network/blog/langgraph-vs-langchain/>
- Functional API: <https://www.langchain.com/blog/introducing-the-langgraph-functional-api>
- Anthropic, "Building effective agents" (simple composable patterns over frameworks)
- This repo: `packages/agent-core/src/loop.ts` (rescue ladder), `session.ts`
  (checkpoint/recovery), `board.ts` (typed multi-agent state), `evals/`
  (both tiers), `tool-repair.ts` (deterministic repair)
