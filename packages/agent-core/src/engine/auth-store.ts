/**
 * Engine credential store (exa-agent-v2): write provider API keys into the
 * opencode server's own auth.json, so keys saved in Studio's UI configure the
 * ENGINE — the single source of truth for cloud providers. The engine runs
 * with XDG_DATA_HOME pinned to Studio's config dir (spawn-args.ts), so the
 * file lives at <configDir>/opencode/auth.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function authPath(configDir: string): string {
  return join(configDir, "opencode", "auth.json");
}

/**
 * Merge one provider's API key into auth.json (created if absent), preserving
 * other entries. Written 0600 — it holds secrets.
 */
export function upsertProviderAuth(configDir: string, providerId: string, apiKey: string): void {
  const file = authPath(configDir);
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    /* first key, or unreadable — start fresh */
  }
  existing[providerId] = { type: "api", key: apiKey };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(existing, null, 2), { mode: 0o600 });
}
