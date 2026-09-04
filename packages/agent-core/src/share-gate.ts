// The security core of dashboard live-sharing: minting a share token, comparing
// it in constant time, parsing a share request path, and the authorization
// decision. Pure and dependency-light (only node:crypto) so the gate is
// unit-tested exhaustively — this is the code standing between the public
// internet and a database-backed page, so it must be provably strict:
//   - the token is high-entropy and unguessable,
//   - comparison is constant-time (no timing oracle),
//   - a wrong token and an unknown share get the SAME denial (no existence leak),
//   - only a single, well-formed /s/<id> path is ever accepted.

import { randomBytes, timingSafeEqual } from "node:crypto";

/** A live share: its secret token and the latest rendered HTML to serve. */
export type ShareEntry = { token: string; html: string };

/** 192-bit unguessable token as 48 hex chars. */
export function newShareToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Constant-time string compare. Length mismatch returns false without a
 * short-circuit that would leak length via timing (we still run a compare).
 */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Run a same-length compare so the reject path isn't obviously faster.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Parse `/s/<id>?t=<token>` — the ONLY shape accepted. Anything else → null. */
export function parseSharePath(rawUrl: string): { id: string; token: string } | null {
  let u: URL;
  try {
    u = new URL(rawUrl, "http://share.local");
  } catch {
    return null;
  }
  const m = /^\/s\/([A-Za-z0-9_-]{1,64})$/.exec(u.pathname);
  if (!m) return null;
  return { id: m[1], token: u.searchParams.get("t") ?? "" };
}

const DUMMY_TOKEN = "0".repeat(48);

/**
 * Authorize a parsed request against the live shares. An unknown share and a
 * wrong token are treated identically (a compare runs in both cases, and both
 * return the same `{ok:false}`), so a caller cannot probe which dashboards are
 * shared. On success, returns the HTML to serve.
 */
export function authorize(shares: Map<string, ShareEntry>, req: { id: string; token: string } | null): { ok: boolean; html?: string } {
  if (!req) return { ok: false };
  const entry = shares.get(req.id);
  if (!entry) {
    tokensMatch(req.token, DUMMY_TOKEN); // same work as the real path
    return { ok: false };
  }
  if (!tokensMatch(req.token, entry.token)) return { ok: false };
  return { ok: true, html: entry.html };
}
