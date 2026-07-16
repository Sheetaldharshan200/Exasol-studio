import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n- …(older notes trimmed)` : text;
}
