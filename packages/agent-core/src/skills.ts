import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Claude-style skills: markdown packs with name+description frontmatter.
// Two sources — BUILT-IN (shipped, read-only) and USER (added in-app, editable).
// The model sees the list; load_skill(name) returns the full body on demand.

export type Skill = { name: string; description: string; body: string; source: "builtin" | "user" };

function builtinDir(): string {
  const here = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../skills", "./skills", "../../skills"]) {
    try {
      const d = join(here, rel);
      readdirSync(d);
      return d;
    } catch {
      /* next */
    }
  }
  return join(here, "../skills");
}

function parse(raw: string, fallbackName: string): { name: string; description: string; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = m?.[1] ?? "";
  const body = (m?.[2] ?? raw).trim();
  const name = /name:\s*(.+)/.exec(fm)?.[1]?.trim() || fallbackName;
  const description = /description:\s*(.+)/.exec(fm)?.[1]?.trim() ?? "";
  return { name, description, body };
}

export class SkillStore {
  private readonly userDir: string;
  private cache: Skill[] | null = null;

  constructor(dataDir: string) {
    this.userDir = join(dataDir, "skills");
    mkdirSync(this.userDir, { recursive: true });
  }

  list(): Skill[] {
    if (this.cache) return this.cache;
    const out: Skill[] = [];
    const readDir = (dir: string, source: "builtin" | "user") => {
      try {
        for (const f of readdirSync(dir)) {
          if (!f.endsWith(".md")) continue;
          const p = parse(readFileSync(join(dir, f), "utf8"), f.replace(/\.md$/, ""));
          out.push({ ...p, source });
        }
      } catch {
        /* none */
      }
    };
    readDir(builtinDir(), "builtin");
    readDir(this.userDir, "user");
    // User skills override built-ins of the same name.
    const byName = new Map<string, Skill>();
    for (const s of out) byName.set(s.name, s);
    this.cache = [...byName.values()];
    return this.cache;
  }

  get(name: string): Skill | undefined {
    return this.list().find((s) => s.name === name || s.name.includes(name));
  }

  save(name: string, description: string, body: string): Skill {
    const safe = name.trim().replace(/[^\w-]+/g, "-").toLowerCase() || "skill";
    const md = `---\nname: ${safe}\ndescription: ${description.replace(/\n/g, " ").trim()}\n---\n\n${body.trim()}\n`;
    writeFileSync(join(this.userDir, `${safe}.md`), md);
    this.cache = null;
    return { name: safe, description, body, source: "user" };
  }

  remove(name: string): boolean {
    try {
      unlinkSync(join(this.userDir, `${name.replace(/[^\w-]+/g, "-").toLowerCase()}.md`));
      this.cache = null;
      return true;
    } catch {
      return false;
    }
  }
}
