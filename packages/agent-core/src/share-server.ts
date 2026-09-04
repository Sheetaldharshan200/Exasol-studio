// The isolated live-share HTTP server. This is a SEPARATE http server on its own
// localhost port — never the agent gateway — so a tunnel pointed at it can expose
// only the one gated dashboard and nothing of the agent bridge. It serves exactly
// one route (GET /s/<id>?t=<token>); every other request, and every failed auth,
// gets an identical 404 so the server reveals nothing about what it hosts.
//
// It holds only rendered HTML (published by the webview) — it never touches the
// database, so even a total compromise of this server leaks a snapshot, not a
// connection.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { authorize, newShareToken, parseSharePath, type ShareEntry } from "./share-gate.ts";

const shares = new Map<string, ShareEntry>();
let server: Server | null = null;
let boundPort = 0;

const DENY = "Not found";

function handle(req: IncomingMessage, res: ServerResponse): void {
  const parsed = req.method === "GET" ? parseSharePath(req.url ?? "/") : null;
  const result = authorize(shares, parsed);
  if (!result.ok || result.html === undefined) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(DENY);
    return;
  }
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    // The shared page is self-contained; forbid framing and outbound requests.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
  });
  res.end(result.html);
}

/** Start the shared server (idempotent). Binds localhost by default so it is only
 *  reachable through the tunnel; pass "0.0.0.0" for LAN sharing. */
export async function ensureShareServer(host = "127.0.0.1"): Promise<number> {
  if (server && boundPort) return boundPort;
  const s = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, host, () => resolve());
  });
  server = s;
  const addr = s.address();
  boundPort = typeof addr === "object" && addr ? addr.port : 0;
  return boundPort;
}

/** Begin (or replace) a share: mint a fresh token, store the html, return where. */
export async function startShare(id: string, html: string, host?: string): Promise<{ port: number; token: string }> {
  const port = await ensureShareServer(host);
  const token = newShareToken();
  shares.set(id, { token, html });
  return { port, token };
}

/** Update the served html for an existing share (the refresh publish). */
export function publishShare(id: string, html: string): boolean {
  const e = shares.get(id);
  if (!e) return false;
  e.html = html;
  return true;
}

/** Rotate the token; the previous link stops working. */
export function rotateShare(id: string): string | null {
  const e = shares.get(id);
  if (!e) return null;
  e.token = newShareToken();
  return e.token;
}

/** Stop one share; when none remain, tear the server down entirely. */
export function stopShare(id: string): void {
  shares.delete(id);
  if (shares.size === 0 && server) {
    server.close();
    server = null;
    boundPort = 0;
  }
}

export function shareStatus(id: string): { active: boolean; port: number } {
  return { active: shares.has(id), port: boundPort };
}

/** Test/shutdown hook: drop every share and close the server. */
export function resetShareServer(): void {
  shares.clear();
  if (server) {
    server.close();
    server = null;
    boundPort = 0;
  }
}
