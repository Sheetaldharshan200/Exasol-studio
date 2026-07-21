import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { cosine, embed, embedOne } from "./embed.ts";

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
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith(".md")) {
            const p = parse(
              readFileSync(join(dir, entry.name), "utf8"),
              entry.name.replace(/\.md$/, ""),
            );
            out.push({ ...p, source });
            continue;
          }
          if (!entry.isDirectory()) continue;
          const skillDir = join(dir, entry.name);
          const skillFile = join(skillDir, "SKILL.md");
          let skill: ReturnType<typeof parse>;
          try {
            skill = parse(readFileSync(skillFile, "utf8"), entry.name);
            out.push({ ...skill, source });
          } catch {
            continue;
          }
          const addReferences = (current: string) => {
            for (const child of readdirSync(current, { withFileTypes: true })) {
              const childPath = join(current, child.name);
              if (child.isDirectory()) {
                addReferences(childPath);
              } else if (child.isFile() && child.name.endsWith(".md") && childPath !== skillFile) {
                const resource = relative(skillDir, childPath).replaceAll("\\", "/");
                out.push({
                  name: `${skill.name}/${resource.replace(/\.md$/, "")}`,
                  description: `Reference material for ${skill.name}: ${resource}`,
                  body: readFileSync(childPath, "utf8").trim(),
                  source,
                });
              }
            }
          };
          addReferences(skillDir);
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

  private vecCache = new Map<string, number[]>();

  /**
   * Semantic skill selection (jcode-style): embed each skill's name +
   * description and return those whose meaning matches the current turn —
   * so the right playbook auto-activates without the model guessing to call
   * load_skill. Cached per skill by content hash.
   */
  async recall(query: string, k = 2, threshold = 0.18): Promise<Skill[]> {
    const skills = this.list();
    if (!skills.length) return [];
    const key = (sk: Skill) => createHash("sha1").update(sk.name + sk.description).digest("hex").slice(0, 16);
    const missing = skills.filter((sk) => !this.vecCache.has(key(sk)));
    if (missing.length) {
      const vecs = await embed(missing.map((sk) => `${sk.name}. ${sk.description}`));
      missing.forEach((sk, i) => this.vecCache.set(key(sk), vecs[i]));
    }
    const qv = await embedOne(query);
    return skills
      .map((sk) => ({ sk, score: cosine(qv, this.vecCache.get(key(sk)) ?? []) }))
      .filter((x) => x.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.sk);
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
