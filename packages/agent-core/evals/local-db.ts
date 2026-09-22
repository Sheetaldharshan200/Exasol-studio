// Shared by the local eval/integration tiers (evals/golden.ts,
// evals/integration.ts): find a local Exasol to run against without any
// configuration, or parse an explicit EXA_EVAL_DSN.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type DbTarget = { label: string; host: string; port: number; user: string; password: string };

export function parseDbUrl(raw: string): { host: string; port: number; user: string; password: string } {
  // Never echo the raw DSN — it carries a password and errors get printed.
  const redacted = raw.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`EXA_EVAL_DSN must be exa://user:pass@host:port, got "${redacted}"`);
  }
  if (u.protocol !== "exa:") throw new Error(`EXA_EVAL_DSN must be exa://user:pass@host:port, got "${redacted}"`);
  return {
    host: u.hostname || "127.0.0.1",
    port: u.port ? Number(u.port) : 8563,
    user: decodeURIComponent(u.username || "sys"),
    password: decodeURIComponent(u.password || ""),
  };
}

/**
 * Zero-config discovery: local Exasol Personal deployments keep their
 * connection facts in deployment.json + secrets.json. Both the standalone
 * (~/.exasol/personal) and the Studio-managed deployment are candidates —
 * callers probe them in order (first one that answers SELECT 1 wins).
 */
export function discoverLocalTargets(): DbTarget[] {
  const roots = [
    { label: "personal (~/.exasol)", dir: join(homedir(), ".exasol", "personal", "deployments", "default") },
    { label: "Studio personal-local", dir: join(homedir(), "Library", "Application Support", "com.exasol.studio", "personal-local", "deployment") },
  ];
  const out: DbTarget[] = [];
  for (const r of roots) {
    try {
      const dep = JSON.parse(readFileSync(join(r.dir, "deployment.json"), "utf8")) as {
        connection?: { host?: string; dbPort?: number; username?: string };
      };
      const sec = JSON.parse(readFileSync(join(r.dir, "secrets.json"), "utf8")) as { dbPassword?: string };
      if (dep.connection?.dbPort && sec.dbPassword) {
        out.push({
          label: r.label,
          host: dep.connection.host ?? "127.0.0.1",
          port: dep.connection.dbPort,
          user: dep.connection.username ?? "sys",
          password: sec.dbPassword,
        });
      }
    } catch {
      /* deployment not present — skip */
    }
  }
  return out;
}

/** The candidate list an explicit DSN replaces entirely. */
export function dbTargets(dsn: string | undefined): DbTarget[] {
  return dsn
    ? [{ label: "EXA_EVAL_DSN", ...parseDbUrl(dsn) }]
    : [...discoverLocalTargets(), { label: "default", host: "127.0.0.1", port: 8563, user: "sys", password: "exasol" }];
}
