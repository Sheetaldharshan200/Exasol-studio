import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
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

      // PUT /v1/providers/:id  {apiKey?, baseURL?, models?}
      if (req.method === "PUT" && parts[1] === "providers" && parts[2]) {
        const body = await readBody<{ apiKey?: string; baseURL?: string; models?: { id: string; name?: string; context?: number }[] }>(req);
        config.update((cfg) => {
          cfg.providers[parts[2]] = { ...cfg.providers[parts[2]], ...body };
        });
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

      // Dashboards: GET list / GET one / PUT save / DELETE
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

      // Dashboards: GET list / GET one / PUT save / DELETE
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

      // Dashboards: GET list / GET one / PUT save / DELETE
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

      // POST /v1/sessions/:id/permission  {id, allow}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "permission") {
        const body = await readBody<{ id: string; allow: boolean }>(req);
        const found = session.answerPermission(body.id, Boolean(body.allow));
        return json(res, found ? 200 : 404, found ? { ok: true } : { error: "no such pending permission" });
      }

      // Dashboards: GET list / GET one / PUT save / DELETE
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

      // POST /v1/sessions/:id/ui-result  {id, ok, detail?}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "ui-result") {
        const body = await readBody<{ id: string; ok: boolean; detail?: string }>(req);
        const found = session.answerUi(body.id, Boolean(body.ok), body.detail);
        return json(res, found ? 200 : 404, found ? { ok: true } : { error: "no such pending ui request" });
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
