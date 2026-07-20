import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { cosine, embed, embedOne } from "./embed.ts";

/**
 * Tiered memory, the KISS way — curated, human-editable markdown files that
 * are injected into every turn (the semantic/preference tier), separate from
 * the raw episodic transcript and the schema knowledge graph.
 *
 *   memory/user.md          durable facts & preferences about the user
 *   memory/project-<id>.md   verified facts about one database
 *   memory/project.md        facts not tied to a connection
 *
 * A soft cap on bullets gives us "forgetting" — oldest notes drop off so the
 * files (and the injected context) never grow unbounded. Everything here is
 * plain markdown the user can open and edit by hand.
 */
export class MemoryStore {
  private readonly dir: string;
  private static readonly MAX_BULLETS = 60;
  private static readonly INJECT_CHARS = 2400;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "memory");
    mkdirSync(this.dir, { recursive: true });
  }

  private file(scope: "user" | "project", conn: string | null): string {
    if (scope === "user") return join(this.dir, "user.md");
    return join(this.dir, conn ? `project-${safe(conn)}.md` : "project.md");
  }

  private read(path: string): string {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  }

  /** Append a note, de-duplicated, with oldest-drops-first forgetting. */
  remember(scope: "user" | "project", conn: string | null, note: string) {
    const clean = note.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!clean) return;
    const path = this.file(scope, conn);
    const existing = this.read(path);
    const header =
      scope === "user"
        ? "# User memory\n\nDurable facts and preferences about the user. Edit freely.\n"
        : "# Project memory\n\nVerified facts about this database. Edit freely.\n";
    const bullets = existing
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim());
    const line = `- ${clean}`;
    if (bullets.some((b) => b.toLowerCase() === line.toLowerCase())) return; // already known
    bullets.push(line);
    const kept = bullets.slice(-MemoryStore.MAX_BULLETS);
    try {
      writeFileSync(path, `${header}\n${kept.join("\n")}\n`);
    } catch {
      // best-effort
    }
  }

  /** Backward-compatible alias for the old insight API. */
  add(conn: string | null, text: string) {
    this.remember("project", conn, text);
  }

  /** Combined memory block for injection, capped so it never floods context. */
  context(conn: string | null): string {
    const user = this.read(this.file("user", null)).trim();
    const project = this.read(this.file("project", conn)).trim();
    const parts: string[] = [];
    if (user) parts.push(cap(user, MemoryStore.INJECT_CHARS));
    if (project) parts.push(cap(project, MemoryStore.INJECT_CHARS));
    return parts.join("\n\n");
  }

  private bullets(conn: string | null): { scope: "user" | "project"; text: string }[] {
    const grab = (raw: string) =>
      raw
        .split("\n")
        .filter((l) => l.trim().startsWith("- "))
        .map((l) => l.trim().slice(2).trim())
        .filter(Boolean);
    return [
      ...grab(this.read(this.file("user", null))).map((text) => ({ scope: "user" as const, text })),
      ...grab(this.read(this.file("project", conn))).map((text) => ({ scope: "project" as const, text })),
    ];
  }

  /** Cached per-bullet embeddings (rebuilt from the markdown, keyed by hash). */
  private async vectors(bullets: string[]): Promise<Map<string, number[]>> {
    const idxPath = join(this.dir, "index.json");
    let cache: Record<string, number[]> = {};
    try {
      cache = JSON.parse(this.read(idxPath) || "{}");
    } catch {
      cache = {};
    }
    const key = (t: string) => createHash("sha1").update(t).digest("hex").slice(0, 16);
    const missing = bullets.filter((b) => !cache[key(b)]);
    if (missing.length) {
      const vecs = await embed(missing);
      missing.forEach((b, i) => (cache[key(b)] = vecs[i]));
      // Prune stale keys, then persist.
      const live = new Set(bullets.map(key));
      for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
      try {
        writeFileSync(idxPath, JSON.stringify(cache));
      } catch {
        /* best-effort */
      }
    }
    return new Map(bullets.map((b) => [b, cache[key(b)]]));
  }

  /**
   * Ambient semantic recall (jcode-style): return the memories most relevant
   * to the current turn, ranked by embedding cosine similarity — so the model
   * gets what matters without spending a tool call, and long memory files
   * don't flood context. Falls back to raw context() if embedding is empty.
   */
  async recall(conn: string | null, query: string, k = 8): Promise<{ scope: "user" | "project"; text: string; score: number }[]> {
    const items = this.bullets(conn);
    if (items.length <= k) return items.map((it) => ({ ...it, score: 1 }));
    try {
      const vecs = await this.vectors(items.map((it) => it.text));
      const qv = await embedOne(query);
      return items
        .map((it) => ({ ...it, score: cosine(qv, vecs.get(it.text) ?? []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    } catch {
      return items.slice(-k).map((it) => ({ ...it, score: 0 }));
    }
  }

  /** Relevance-ranked memory block for a turn (used by the loop). */
  async contextFor(conn: string | null, query: string): Promise<string> {
    const hits = await this.recall(conn, query);
    if (!hits.length) return "";
    const user = hits.filter((h) => h.scope === "user").map((h) => `- ${h.text}`);
    const project = hits.filter((h) => h.scope === "project").map((h) => `- ${h.text}`);
    const parts: string[] = [];
    if (user.length) parts.push(`About the user:\n${user.join("\n")}`);
    if (project.length) parts.push(`About this database:\n${project.join("\n")}`);
    return parts.join("\n\n");
  }
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n- …(older notes trimmed)` : text;
}
