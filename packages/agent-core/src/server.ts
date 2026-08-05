import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_AGENT_SETTINGS, type AgentSettings, type ConfigStore } from "./config.ts";
import { ProviderRegistry } from "./providers.ts";
import { SessionStore } from "./session.ts";
import { DbRegistry, type DbConnectionInfo } from "./db.ts";
import { MemoryStore } from "./memory.ts";
import { KnowledgeGraph } from "./kb.ts";
import { DashboardStore } from "./dashboards.ts";
import { McpManager } from "./mcp.ts";
import { ArtifactStore } from "./artifacts.ts";
import { DocumentStore } from "./documents.ts";
import type { Attachment } from "./loop.ts";
import { SkillStore } from "./skills.ts";
import { runTurn } from "./loop.ts";
import { log } from "./log.ts";
import { EngineService } from "./engine/engine-service.ts";

// Minimal localhost HTTP + SSE server. No framework by design: six routes,
// token auth, and Server-Sent Events — node:http covers all of it.

export async function startServer(config: ConfigStore): Promise<{ port: number; token: string }> {
  const token = randomBytes(24).toString("hex");
  const registry = new ProviderRegistry(config);
  const sessions = new SessionStore(config.dataDir);
  const db = new DbRegistry();
  const memory = new MemoryStore(config.dataDir);
  const kb = new KnowledgeGraph(config.dataDir);
  const dashboards = new DashboardStore(config.dataDir);
  const mcp = new McpManager(config.dataDir);
  void mcp.connectAll();
  const artifacts = new ArtifactStore(config.dataDir);
  const documents = new DocumentStore();
  const skills = new SkillStore(config.dataDir);
  // Exa engine (opencode) — reads EXA_ENGINE_BIN / EXA_ENGINE_CONFIG_DIR from
  // the sidecar's env; degrades cleanly to "not installed" when absent.
  const engine = new EngineService();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      // EventSource cannot set headers, so the token may also arrive as a query param.
      const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
      if (auth !== token) return json(res, 401, { error: "unauthorized" });

      const parts = url.pathname.split("/").filter(Boolean); // ["v1", ...]
      if (parts[0] !== "v1") return json(res, 404, { error: "not found" });

      // GET /v1/health
      if (req.method === "GET" && parts[1] === "health") return json(res, 200, { ok: true });

      // GET /v1/models
      if (req.method === "GET" && parts[1] === "models") {
        const providers = await registry.list();
        return json(res, 200, { providers, defaultModel: config.get().model ?? null });
      }

      // ── Exa engine (opencode) ───────────────────────────────────────────
      if (parts[1] === "engine") {
        // GET /v1/engine/status
        if (req.method === "GET" && parts[2] === "status") {
          return json(res, 200, { ...(await engine.status()), provisioned: engine.provisioned });
        }
        // GET /v1/engine/providers — the engine's CONFIGURED providers/models
        if (req.method === "GET" && parts[2] === "providers") {
          return json(res, 200, await engine.providers());
        }
        // GET /v1/engine/catalog — the FULL models.dev provider catalog
        if (req.method === "GET" && parts[2] === "catalog") {
          try {
            return json(res, 200, { providers: await engine.catalog() });
          } catch {
            return json(res, 502, { error: "catalog unavailable (offline?)" });
          }
        }
        // POST /v1/engine/auth — save a provider API key into the engine
        if (req.method === "POST" && parts[2] === "auth") {
          const b = await readBody<{ providerId?: string; key?: string }>(req);
          if (!b.providerId || !b.key) return json(res, 400, { error: "providerId and key required" });
          const ok = await engine.setProviderAuth(b.providerId, b.key);
          return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
        }
        // GET /v1/engine/auth-methods — per-provider connect-flow spec
        if (req.method === "GET" && parts[2] === "auth-methods") {
          return json(res, 200, { methods: await engine.authMethods() });
        }
        // POST /v1/engine/oauth/(authorize|callback)
        if (req.method === "POST" && parts[2] === "oauth" && parts[3] === "authorize") {
          const b = await readBody<{ providerId?: string; method?: number; inputs?: Record<string, string> }>(req);
          if (!b.providerId || typeof b.method !== "number") return json(res, 400, { error: "providerId and method required" });
          try {
            return json(res, 200, { authorization: await engine.oauthAuthorize(b.providerId, b.method, b.inputs) });
          } catch (e) {
            return json(res, 502, { error: e instanceof Error ? e.message : "authorize failed" });
          }
        }
        if (req.method === "POST" && parts[2] === "oauth" && parts[3] === "callback") {
          const b = await readBody<{ providerId?: string; method?: number; code?: string }>(req);
          if (!b.providerId || typeof b.method !== "number") return json(res, 400, { error: "providerId and method required" });
          try {
            const ok = await engine.oauthCallback(b.providerId, b.method, b.code);
            return json(res, ok ? 200 : 502, ok ? { ok: true } : { error: "authorization was not completed" });
          } catch (e) {
            return json(res, 502, { error: e instanceof Error ? e.message : "callback failed" });
          }
        }
        // GET /v1/engine/sessions | POST to create
        if (parts[2] === "sessions" && !parts[3]) {
          if (req.method === "GET") return json(res, 200, { sessions: await engine.listSessions() });
          if (req.method === "POST") {
            const id = await engine.createSession();
            return id ? json(res, 200, { id }) : json(res, 503, { error: "engine not installed" });
          }
        }
        // GET /v1/engine/sessions/:id/messages — stored history (replay)
        if (req.method === "GET" && parts[2] === "sessions" && parts[3] && parts[4] === "messages") {
          return json(res, 200, { messages: await engine.listMessages(decodeURIComponent(parts[3])) });
        }
        // DELETE /v1/engine/sessions/:id — permanently remove a session
        if (req.method === "DELETE" && parts[2] === "sessions" && parts[3] && !parts[4]) {
          const ok = await engine.deleteSession(decodeURIComponent(parts[3]));
          return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
        }
        // POST /v1/engine/sessions/:id/rename {title}
        if (req.method === "POST" && parts[2] === "sessions" && parts[3] && parts[4] === "rename") {
          const b = await readBody<{ title?: string }>(req);
          if (!b.title?.trim()) return json(res, 400, { error: "title required" });
          const ok = await engine.renameSession(decodeURIComponent(parts[3]), b.title.trim());
          return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
        }
        // POST /v1/engine/sessions/:id/(prompt|abort|permission)
        if (req.method === "POST" && parts[2] === "sessions" && parts[3]) {
          const sid = decodeURIComponent(parts[3]);
          if (parts[4] === "prompt") {
            const b = await readBody<{ text?: string; model?: { providerID: string; modelID: string }; agent?: string }>(req);
            const ok = await engine.prompt(sid, b.text ?? "", b.model, b.agent);
            return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
          }
          if (parts[4] === "abort") {
            await engine.abort(sid);
            return json(res, 200, { ok: true });
          }
          if (parts[4] === "compact") {
            const ok = await engine.compact(sid);
            return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
          }
          if (parts[4] === "undo" || parts[4] === "redo") {
            try {
              const ok = parts[4] === "undo" ? await engine.undo(sid) : await engine.redo(sid);
              return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: "engine not installed" });
            } catch (e) {
              return json(res, 502, { error: e instanceof Error ? e.message : `${parts[4]} failed` });
            }
          }
          if (parts[4] === "permission") {
            const b = await readBody<{ permissionId?: string; approve?: boolean }>(req);
            await engine.respondPermission(sid, b.permissionId ?? "", Boolean(b.approve));
            return json(res, 200, { ok: true });
          }
        }
        // GET /v1/engine/events — SSE stream of StudioAgentEvent
        if (req.method === "GET" && parts[2] === "events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const ac = new AbortController();
          req.on("close", () => ac.abort());
          try {
            await engine.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`), ac.signal);
          } catch {
            /* stream ended */
          }
          return res.end();
        }
        return json(res, 404, { error: "not found" });
      }

      // POST /v1/providers/probe {baseURL, apiKey?} — test an OpenAI-compatible
      // endpoint before saving it (the sidecar can reach any host; the webview
      // can't). Returns reachability + how many models it advertises.
      if (req.method === "POST" && parts[1] === "providers" && parts[2] === "probe") {
        const body = await readBody<{ baseURL?: string; apiKey?: string }>(req);
        const base = (body.baseURL ?? "").trim().replace(/\/+$/, "");
        if (!base) return json(res, 400, { error: "baseURL is required" });
        try {
          const r = await fetch(`${base}/models`, {
            headers: body.apiKey ? { authorization: `Bearer ${body.apiKey}` } : undefined,
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) return json(res, 200, { ok: false, error: `Endpoint returned HTTP ${r.status}` });
          const payload = (await r.json().catch(() => ({}))) as { data?: unknown[] };
          const models = Array.isArray(payload.data) ? payload.data.length : 0;
          return json(res, 200, { ok: true, models });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json(res, 200, { ok: false, error: /timeout|aborted/i.test(msg) ? "No response (timeout) — is the server running and reachable?" : msg });
        }
      }

      // Probe a provider's ACTUAL tokens-per-minute budget from its rate-limit
      // headers (OpenAI-compatible APIs return x-ratelimit-limit-tokens on a
      // 1-token completion). Lets lean/full turns adapt to the account tier —
      // free tier goes lean, Dev/paid tiers keep the full experience.
      const probeProviderTpm = async (providerId: string, apiKey: string) => {
        const targets: Record<string, { url: string; model: string }> = {
          groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.1-8b-instant" },
          openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
        };
        const t = targets[providerId];
        if (!t) return;
        try {
          const res = await fetch(t.url, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ model: t.model, max_tokens: 1, messages: [{ role: "user", content: "." }] }),
          });
          const raw = res.headers.get("x-ratelimit-limit-tokens");
          const tpm = raw ? Number(raw.replace(/[^0-9]/g, "")) : NaN;
          config.update((cfg) => {
            cfg.providerLimits = { ...cfg.providerLimits, [providerId]: { tpm: Number.isFinite(tpm) && tpm > 0 ? tpm : null, at: Date.now() } };
          });
          log.info("provider tpm probed", { provider: providerId, tpm: Number.isFinite(tpm) ? tpm : null, status: res.status });
        } catch (e) {
          log.warn("provider tpm probe failed", { provider: providerId, error: String(e) });
        }
      };

      // PUT /v1/providers/:id  {apiKey?, baseURL?, models?}
      if (req.method === "PUT" && parts[1] === "providers" && parts[2]) {
        const body = await readBody<{ apiKey?: string; baseURL?: string; models?: { id: string; name?: string; context?: number }[] }>(req);
        // Paste hygiene: stray whitespace/newlines in a copied key make the
        // provider reject it with a confusing "API key not valid".
        if (typeof body.apiKey === "string") body.apiKey = body.apiKey.trim();
        if (typeof body.baseURL === "string") body.baseURL = body.baseURL.trim();
        config.update((cfg) => {
          cfg.providers[parts[2]] = { ...cfg.providers[parts[2]], ...body };
          // A new key can mean a new tier — forget the old budget until re-probed.
          if (body.apiKey && cfg.providerLimits?.[parts[2]]) delete cfg.providerLimits[parts[2]];
        });
        if (body.apiKey) void probeProviderTpm(parts[2], body.apiKey);
        return json(res, 200, { ok: true });
      }

      // GET /v1/settings — guardrails + behavior
      if (req.method === "GET" && parts[1] === "settings") {
        return json(res, 200, { settings: config.settings(), defaults: DEFAULT_AGENT_SETTINGS });
      }

      // PUT /v1/settings — partial update
      if (req.method === "PUT" && parts[1] === "settings") {
        const body = await readBody<Partial<AgentSettings>>(req);
        config.update((cfg) => {
          cfg.agent = { ...cfg.agent, ...body };
        });
        return json(res, 200, { settings: config.settings() });
      }

      // PUT /v1/config  {model?}
      if (req.method === "PUT" && parts[1] === "config") {
        const body = await readBody<{ model?: string }>(req);
        config.update((cfg) => {
          if (body.model) cfg.model = body.model;
        });
        return json(res, 200, { ok: true });
      }

      // POST /v1/rewrite  {sql, action, instruction?} → { sql }
      // One-shot SQL rewrite for the editor's inline diff (optimize / fix /
      // free-form edit). No tools, no chat session — returns ONLY the rewritten
      // statement so the editor can show an accept/decline diff.
      if (req.method === "POST" && parts[1] === "rewrite") {
        const body = await readBody<{ sql?: string; action?: string; instruction?: string }>(req);
        const sql = (body.sql ?? "").trim();
        if (!sql) return json(res, 400, { error: "sql is required" });
        const modelRef = config.get().model;
        if (!modelRef) return json(res, 400, { error: "No AI model is configured." });
        const model = registry.resolve(modelRef, { temperature: 0 });
        const goal =
          body.action === "optimize"
            ? "Rewrite the SQL to run faster on Exasol while returning identical results (better join order, projection, avoiding needless scans/CTEs)."
            : body.action === "fix"
              ? "Fix any syntax or semantic errors so the SQL runs on Exasol. Change as little as possible."
              : `Apply this instruction to the SQL: ${body.instruction ?? ""}`;
        const { generateText } = await import("./llm.ts");
        const out = await generateText({
          model,
          system:
            "You are an Exasol SQL rewriter. Return ONLY the rewritten SQL — no prose, no explanation, no markdown fences. Preserve the user's formatting style. If nothing should change, return the SQL unchanged.",
          prompt: `${goal}\n\nSQL:\n${sql}`,
          maxSteps: 1,
        });
        // Strip any stray fences the model adds despite instructions.
        const cleaned = out.text
          .replace(/^\s*```(?:sql)?\s*/i, "")
          .replace(/\s*```\s*$/i, "")
          .trim();
        return json(res, 200, { sql: cleaned || sql });
      }

      // PUT /v1/connections  (server-to-server from the app's Rust side —
      // credentials are held in memory only and never returned by any route)
      if (req.method === "PUT" && parts[1] === "connections") {
        const info = await readBody<DbConnectionInfo>(req);
        if (!info.id || !info.host || !info.user) return json(res, 400, { error: "id, host, user required" });
        db.register(info);
        // Crawl the schema graph in the background so kb_search is warm.
        setTimeout(() => {
          kb.refresh(info.id, db).catch((e) => log.warn("kb crawl failed", { error: String(e) }));
        }, 50);
        return json(res, 200, { ok: true });
      }

      // GET /v1/connections — names only, no secrets.
      if (req.method === "GET" && parts[1] === "connections") {
        return json(res, 200, { connections: db.list() });
      }

      // ── Studio MCP gateway: one MCP server for ALL connected databases. ──
      // The stdio bridge (mcp-gateway.cjs, launched by external AI clients)
      // proxies its tool calls here, so whatever is connected in Studio right
      // now is what external clients can query. Read-only is enforced HERE
      // because these pools carry the profiles' own credentials.
      if (req.method === "GET" && parts[1] === "gateway" && parts[2] === "databases") {
        const cfg0 = config.get();
        const exposure = cfg0.gatewayExposure ?? {};
        const caps = cfg0.gatewayCaps ?? {};
        return json(res, 200, {
          databases: db.list().map((c) => ({
            ...c,
            exposed: exposure[c.id] !== false,
            caps: { sql: caps[c.id]?.sql !== false, nl2sql: caps[c.id]?.nl2sql !== false },
          })),
          services: [{ id: "dashboards", exposed: exposure["service:dashboards"] !== false }],
        });
      }
      // PUT /v1/gateway/databases/:id {exposed?, caps?} — flip a connection's
      // MCP exposure and/or its per-capability selection (persisted).
      if (req.method === "PUT" && parts[1] === "gateway" && parts[2] === "databases" && parts[3]) {
        const id = decodeURIComponent(parts[3]);
        const body = await readBody<{ exposed?: boolean; caps?: Partial<Record<"sql" | "nl2sql", boolean>> }>(req);
        if (typeof body.exposed !== "boolean" && !body.caps) return json(res, 400, { error: "exposed or caps is required" });
        config.update((cfg) => {
          if (typeof body.exposed === "boolean") cfg.gatewayExposure = { ...cfg.gatewayExposure, [id]: body.exposed };
          if (body.caps) cfg.gatewayCaps = { ...cfg.gatewayCaps, [id]: { ...cfg.gatewayCaps?.[id], ...body.caps } };
        });
        return json(res, 200, { ok: true });
      }
      // PUT /v1/gateway/services/:id {exposed} — bus-level Studio services.
      if (req.method === "PUT" && parts[1] === "gateway" && parts[2] === "services" && parts[3]) {
        const id = `service:${decodeURIComponent(parts[3])}`;
        const body = await readBody<{ exposed?: boolean }>(req);
        if (typeof body.exposed !== "boolean") return json(res, 400, { error: "exposed (boolean) is required" });
        config.update((cfg) => {
          cfg.gatewayExposure = { ...cfg.gatewayExposure, [id]: body.exposed! };
        });
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[1] === "gateway" && parts[2] === "query") {
        const body = await readBody<{ database?: string; sql?: string }>(req);
        const wanted = (body.database ?? "").trim();
        const sql = (body.sql ?? "").trim().replace(/;\s*$/, "");
        if (!wanted || !sql) return json(res, 400, { error: "database and sql are required" });
        const conns = db.list();
        const target =
          conns.find((c) => c.id === wanted) ??
          conns.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
        const exposure = config.get().gatewayExposure ?? {};
        if (!target) {
          const names = conns.filter((c) => exposure[c.id] !== false).map((c) => c.name).join(", ");
          return json(res, 404, {
            error: `No connected database named "${wanted}". Currently on the gateway: ${names || "(none — connect one in Exasol Studio first)"}.`,
          });
        }
        if (exposure[target.id] === false) {
          return json(res, 403, {
            error: `"${target.name}" is connected in Exasol Studio, but its MCP exposure is turned OFF. Enable it in Studio under Marketplace → AI clients → Databases on the gateway.`,
          });
        }
        if ((config.get().gatewayCaps ?? {})[target.id]?.sql === false) {
          return json(res, 403, {
            error: `The SQL service is turned off for "${target.name}" on the Studio gateway — enable it under Marketplace → AI clients → Databases on the gateway.`,
          });
        }
        if (!/^(select|with|describe|desc)\b/i.test(sql)) {
          return json(res, 403, { error: "The Studio gateway is read-only: only SELECT, WITH and DESCRIBE statements are allowed." });
        }
        // One statement per call (semicolons checked outside string literals).
        if (sql.replace(/'(?:[^']|'')*'/g, "''").includes(";")) {
          return json(res, 403, { error: "One statement per call — remove the extra ';'." });
        }
        const out = await db.query(target.id, sql);
        return json(res, 200, { database: target.name, ...out });
      }
      // POST /v1/gateway/nl2sql {database, question} → {sql} — the text-to-SQL
      // service: generates SQL grounded in the database's REAL schema but
      // never executes it (the client inspects, then calls the query route).
      if (req.method === "POST" && parts[1] === "gateway" && parts[2] === "nl2sql") {
        const body = await readBody<{ database?: string; question?: string }>(req);
        const wanted = (body.database ?? "").trim();
        const question = (body.question ?? "").trim();
        if (!wanted || !question) return json(res, 400, { error: "database and question are required" });
        const conns = db.list();
        const target =
          conns.find((c) => c.id === wanted) ?? conns.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
        if (!target) return json(res, 404, { error: `No connected database named "${wanted}".` });
        const cfg1 = config.get();
        if ((cfg1.gatewayExposure ?? {})[target.id] === false || (cfg1.gatewayCaps ?? {})[target.id]?.nl2sql === false) {
          return json(res, 403, {
            error: `The text-to-SQL service is turned off for "${target.name}" on the Studio gateway — enable it under Marketplace → AI clients → Databases on the gateway.`,
          });
        }
        const modelRef = cfg1.model;
        if (!modelRef) return json(res, 400, { error: "No AI model is configured in Exasol Studio — pick one in the AI panel first." });
        // Ground the generation in the actual schema (bounded so huge
        // databases don't blow the prompt).
        const cols = await db.query(
          target.id,
          "SELECT COLUMN_SCHEMA || '.' || COLUMN_TABLE || '.' || COLUMN_NAME || ' ' || COLUMN_TYPE FROM SYS.EXA_ALL_COLUMNS WHERE COLUMN_SCHEMA NOT LIKE 'SYS%' ORDER BY COLUMN_SCHEMA, COLUMN_TABLE, COLUMN_ORDINAL_POSITION LIMIT 400",
        );
        const schemaCtx = cols.rows.map((r) => String(r[0])).join("\n");
        const model = registry.resolve(modelRef, { temperature: 0 });
        const { generateText } = await import("./llm.ts");
        const out = await generateText({
          model,
          system:
            "You translate natural-language questions into a SINGLE read-only Exasol SQL statement (SELECT or WITH). Use ONLY tables and columns from the provided schema. Exasol folds unquoted identifiers to UPPERCASE; use LIMIT n (never FETCH FIRST/TOP). Return ONLY the SQL — no prose, no markdown fences.",
          prompt: `Schema (schema.table.column type):\n${schemaCtx}\n\nQuestion: ${question}`,
          maxSteps: 1,
        });
        const cleaned = out.text.replace(/^\s*```(?:sql)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        if (!cleaned) return json(res, 500, { error: "The model returned no SQL." });
        return json(res, 200, { database: target.name, sql: cleaned });
      }
      // POST /v1/gateway/kb {database, question, limit?} → {cards} — the
      // knowledge base: Studio's per-connection table graph (summaries, columns,
      // relationships) searched for a question, so the agent grounds answers in
      // what Studio already learned about the schema instead of re-discovering
      // it. Read-only; gated by the same exposure toggle as the SQL service.
      if (req.method === "POST" && parts[1] === "gateway" && parts[2] === "kb") {
        const body = await readBody<{ database?: string; question?: string; limit?: number }>(req);
        const wanted = (body.database ?? "").trim();
        const question = (body.question ?? "").trim();
        if (!wanted || !question) return json(res, 400, { error: "database and question are required" });
        const conns = db.list();
        const target =
          conns.find((c) => c.id === wanted) ?? conns.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
        if (!target) return json(res, 404, { error: `No connected database named "${wanted}".` });
        if ((config.get().gatewayExposure ?? {})[target.id] === false) {
          return json(res, 403, { error: `"${target.name}" is not exposed on the Studio gateway.` });
        }
        const limit = Math.min(20, Math.max(1, body.limit ?? 5));
        return json(res, 200, { database: target.name, cards: kb.search(target.id, question, limit) });
      }
      // POST /v1/gateway/memory {database?, query} → {memories} — recall the
      // durable facts Studio remembers (user prefs + verified project notes),
      // ranked for the query. POST /v1/gateway/memory/remember {database?,
      // note} stores one. Both carry a crown-jewel capability onto the engine.
      if (parts[1] === "gateway" && parts[2] === "memory") {
        const connFor = (name?: string) => {
          const w = (name ?? "").trim();
          if (!w) return null;
          const c = db.list().find((x) => x.id === w || x.name.toLowerCase() === w.toLowerCase());
          return c?.id ?? null;
        };
        if (req.method === "POST" && !parts[3]) {
          const b = await readBody<{ database?: string; query?: string }>(req);
          const q = (b.query ?? "").trim();
          if (!q) return json(res, 400, { error: "query is required" });
          return json(res, 200, { memories: await memory.recall(connFor(b.database), q, 8) });
        }
        if (req.method === "POST" && parts[3] === "remember") {
          const b = await readBody<{ database?: string; note?: string; scope?: "user" | "project" }>(req);
          const note = (b.note ?? "").trim();
          if (!note) return json(res, 400, { error: "note is required" });
          memory.remember(b.scope === "user" ? "user" : "project", connFor(b.database), note);
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { error: "not found" });
      }
      // Dashboards service: Studio's saved dashboards (their panels carry the
      // SQL), exposed on the bus when the service toggle is on.
      if (req.method === "GET" && parts[1] === "gateway" && parts[2] === "dashboards") {
        if ((config.get().gatewayExposure ?? {})["service:dashboards"] === false) {
          return json(res, 403, { error: "The Dashboards service is turned off on the Studio gateway — enable it under Marketplace → AI clients." });
        }
        if (parts[3]) {
          const d = dashboards.get(decodeURIComponent(parts[3]));
          if (!d) return json(res, 404, { error: "No dashboard with that id." });
          return json(res, 200, { dashboard: d });
        }
        return json(res, 200, { dashboards: dashboards.list() });
      }

      // Audit: GET the tail of the MCP tool-denial audit log
      if (parts[1] === "audit") {
        const limit = Number(new URL(req.url ?? "/", "http://x").searchParams.get("limit") ?? 100);
        return json(res, 200, { events: mcp.audit.tail(Math.min(limit, 500)) });
      }
      if (parts[1] === "mcp") {
        if (req.method === "GET" && parts[2] === "catalog") {
          const { CONNECTOR_MANIFESTS } = await import("./mcp.ts");
          return json(res, 200, { manifests: CONNECTOR_MANIFESTS });
        }
        if (req.method === "GET" && !parts[2]) return json(res, 200, { servers: mcp.list() });
        if (req.method === "POST" && !parts[2]) {
          const body = (await readBody(req)) as { name: string; transport?: "stdio" | "http"; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> };
          const isHttp = body?.transport === "http" || (!body?.command && !!body?.url);
          if (!body?.name || (isHttp ? !body?.url : !body?.command)) return json(res, 400, { error: isHttp ? "name and url are required" : "name and command are required" });
          const server = await mcp.add({ name: body.name, transport: body.transport, command: body.command, args: body.args ?? [], env: body.env, url: body.url, headers: body.headers });
          const status = mcp.list().find((x) => x.id === server.id);
          return json(res, 200, { server: status });
        }
        if (req.method === "POST" && parts[2] && parts[3] === "reconnect") {
          return json(res, 200, await mcp.connect(decodeURIComponent(parts[2])));
        }
        if (req.method === "DELETE" && parts[2]) {
          await mcp.remove(decodeURIComponent(parts[2]));
          return json(res, 200, { ok: true });
        }
      }
      // Dashboards: GET list / GET one / GET history / POST rollback / PUT save / DELETE
      if (parts[1] === "dashboards") {
        if (req.method === "GET" && !parts[2]) return json(res, 200, { dashboards: dashboards.list() });
        if (req.method === "GET" && parts[2] && parts[3] === "history") {
          return json(res, 200, { history: dashboards.history(decodeURIComponent(parts[2])) });
        }
        if (req.method === "POST" && parts[2] && parts[3] === "rollback") {
          const body = (await readBody(req)) as { index?: number };
          const d = dashboards.rollback(decodeURIComponent(parts[2]), body.index ?? 0);
          return d ? json(res, 200, { dashboard: d }) : json(res, 404, { error: "no such revision" });
        }
        if (req.method === "GET" && parts[2]) {
          const d = dashboards.get(decodeURIComponent(parts[2]));
          return d ? json(res, 200, { dashboard: d }) : json(res, 404, { error: "not found" });
        }
        if (req.method === "PUT") {
          try {
            const d = dashboards.save(await readBody(req));
            return json(res, 200, { dashboard: d });
          } catch (e) {
            return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
          }
        }
        if (req.method === "DELETE" && parts[2]) {
          return json(res, dashboards.delete(decodeURIComponent(parts[2])) ? 200 : 404, { ok: true });
        }
      }

      // Skills: list / save / delete
      if (parts[1] === "skills") {
        if (req.method === "GET" && !parts[2]) return json(res, 200, { skills: skills.list() });
        if (req.method === "PUT") {
          const b = await readBody<{ name: string; description?: string; body: string }>(req);
          if (!b.name || !b.body) return json(res, 400, { error: "name and body required" });
          return json(res, 200, { skill: skills.save(b.name, b.description ?? "", b.body) });
        }
        if (req.method === "DELETE" && parts[2]) {
          return json(res, skills.remove(decodeURIComponent(parts[2])) ? 200 : 404, { ok: true });
        }
      }

      // GET /v1/artifacts — list (newest first)
      if (req.method === "GET" && parts[1] === "artifacts" && !parts[2]) {
        return json(res, 200, { artifacts: artifacts.list() });
      }

      // GET /v1/artifacts/:id
      if (req.method === "GET" && parts[1] === "artifacts" && parts[2]) {
        const a = artifacts.get(decodeURIComponent(parts[2]));
        return a ? json(res, 200, { artifact: a }) : json(res, 404, { error: "not found" });
      }

      // POST /v1/sessions
      if (req.method === "POST" && parts[1] === "sessions" && !parts[2]) {
        const s = sessions.create();
        return json(res, 200, { id: s.id });
      }

      // GET /v1/sessions — list (newest first)
      if (req.method === "GET" && parts[1] === "sessions" && !parts[2]) {
        return json(res, 200, { sessions: sessions.list() });
      }

      const session = parts[2] ? sessions.get(parts[2]) : undefined;

      // GET /v1/sessions/:id/items — render-ready replay for session switch
      if (req.method === "GET" && parts[1] === "sessions" && session && parts[3] === "items") {
        return json(res, 200, { title: session.title, items: session.replay() });
      }

      // DELETE /v1/sessions/:id
      if (req.method === "DELETE" && parts[1] === "sessions" && parts[2] && !parts[3]) {
        const ok = sessions.delete(parts[2]);
        return json(res, ok ? 200 : 404, ok ? { ok: true } : { error: "not found" });
      }

      // GET /v1/sessions/:id/stream  (SSE)
      if (req.method === "GET" && parts[1] === "sessions" && session && parts[3] === "stream") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify({ type: "status", state: session.running ? "streaming" : "idle" })}\n\n`);
        const unsubscribe = session.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
        const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
        req.on("close", () => {
          clearInterval(ping);
          unsubscribe();
        });
        return;
      }

      // POST /v1/sessions/:id/revert {userIndex} — cut history before that user message
      if (req.method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "revert") {
        const session = sessions.get(decodeURIComponent(parts[2]));
        if (!session) return json(res, 404, { error: "no such session" });
        const body = (await readBody(req)) as { userIndex?: number };
        const removedText = session.truncateAtUser(body.userIndex ?? 0);
        sessions.touch(session);
        return json(res, 200, { removedText });
      }
      // POST /v1/sessions/:id/fork {userIndex} — branch into a new session
      if (req.method === "POST" && parts[1] === "sessions" && parts[2] && parts[3] === "fork") {
        const body = (await readBody(req)) as { userIndex?: number };
        const forked = sessions.fork(decodeURIComponent(parts[2]), body.userIndex ?? 0);
        return forked
          ? json(res, 200, { id: forked.id, title: forked.title })
          : json(res, 404, { error: "no such session" });
      }
      // POST /v1/sessions/:id/messages  {text, model, context?, connectionId?}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "messages") {
        const body = await readBody<{ text: string; model: string; context?: string; connectionId?: string; attachments?: Attachment[] }>(req);
        if (!body.text || !body.model) return json(res, 400, { error: "text and model are required" });
        if (session.running) return json(res, 409, { error: "already generating" });
        session.connectionId = body.connectionId ?? session.connectionId;
        // Fire the turn; the client watches the SSE stream.
        void runTurn({
          mcp,
          session,
          registry,
          db,
          memory,
          kb,
          store: sessions,
          config,
          dashboards,
          artifacts,
          skills,
          documents,
          modelRef: body.model,
          userText: body.text,
          context: body.context,
          attachments: body.attachments,
        });
        return json(res, 202, { ok: true });
      }

      // POST /v1/sessions/:id/permission  {id, allow}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "permission") {
        const body = await readBody<{ id: string; allow: boolean }>(req);
        const found = session.answerPermission(body.id, Boolean(body.allow));
        return json(res, found ? 200 : 404, found ? { ok: true } : { error: "no such pending permission" });
      }

      // POST /v1/sessions/:id/ui-result  {id, ok, detail?}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "ui-result") {
        const body = await readBody<{ id: string; ok: boolean; detail?: string }>(req);
        const found = session.answerUi(body.id, Boolean(body.ok), body.detail);
        return json(res, found ? 200 : 404, found ? { ok: true } : { error: "no such pending ui request" });
      }

      // POST /v1/sessions/:id/abort
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "abort") {
        session.abort?.abort();
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: "not found" });
    } catch (e) {
      log.error("request failed", { error: String(e) });
      if (!res.headersSent) return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    // Port 0 → OS assigns a free port; localhost only.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

  // Discovery marker for the MCP gateway bridge (mcp-gateway.cjs): external
  // AI clients launch the bridge, the bridge reads this file to find the live
  // port + token. User-only permissions; same trust level as the data dir.
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(join(config.dataDir, "gateway.json"), JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  } catch (e) {
    log.warn("could not write gateway.json", { error: String(e) });
  }

  return { port, token };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}
