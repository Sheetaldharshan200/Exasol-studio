import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { ConfigStore } from "./config.ts";
import { ProviderRegistry } from "./providers.ts";
import { SessionStore } from "./session.ts";
import { runTurn } from "./loop.ts";
import { log } from "./log.ts";

// Minimal localhost HTTP + SSE server. No framework by design: six routes,
// token auth, and Server-Sent Events — node:http covers all of it.

export async function startServer(config: ConfigStore): Promise<{ port: number; token: string }> {
  const token = randomBytes(24).toString("hex");
  const registry = new ProviderRegistry(config);
  const sessions = new SessionStore(config.dataDir);

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

      // PUT /v1/providers/:id  {apiKey?, baseURL?}
      if (req.method === "PUT" && parts[1] === "providers" && parts[2]) {
        const body = await readBody<{ apiKey?: string; baseURL?: string }>(req);
        config.update((cfg) => {
          cfg.providers[parts[2]] = { ...cfg.providers[parts[2]], ...body };
        });
        return json(res, 200, { ok: true });
      }

      // PUT /v1/config  {model?}
      if (req.method === "PUT" && parts[1] === "config") {
        const body = await readBody<{ model?: string }>(req);
        config.update((cfg) => {
          if (body.model) cfg.model = body.model;
        });
        return json(res, 200, { ok: true });
      }

      // POST /v1/sessions
      if (req.method === "POST" && parts[1] === "sessions" && !parts[2]) {
        const s = sessions.create();
        return json(res, 200, { id: s.id });
      }

      const session = parts[2] ? sessions.get(parts[2]) : undefined;

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

      // POST /v1/sessions/:id/messages  {text, model, context?}
      if (req.method === "POST" && parts[1] === "sessions" && session && parts[3] === "messages") {
        const body = await readBody<{ text: string; model: string; context?: string }>(req);
        if (!body.text || !body.model) return json(res, 400, { error: "text and model are required" });
        if (session.running) return json(res, 409, { error: "already generating" });
        // Fire the turn; the client watches the SSE stream.
        void runTurn({
          session,
          registry,
          modelRef: body.model,
          userText: body.text,
          context: body.context,
        });
        return json(res, 202, { ok: true });
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
