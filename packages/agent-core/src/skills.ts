import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Claude-style skills: markdown packs with name+description frontmatter.
// The model sees the list (progressive disclosure) and loads full content
// on demand via the load_skill tool.

export type Skill = { name: string; description: string; body: string };

function skillsDir(): string {
  // Bundled next to the built cjs (…/dist) → ../skills; falls back to src layout.
  const here = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../skills", "./skills", "../../skills"]) {
    try {
      const d = join(here, rel);
      readdirSync(d);
      return d;
    } catch {
      // next
    }
  }
  return join(here, "../skills");
}

let cache: Skill[] | null = null;

export function loadSkills(): Skill[] {
  if (cache) return cache;
  const out: Skill[] = [];
  try {
    for (const f of readdirSync(skillsDir())) {
      if (!f.endsWith(".md")) continue;
      const raw = readFileSync(join(skillsDir(), f), "utf8");
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const fm = m?.[1] ?? "";
      const body = (m?.[2] ?? raw).trim();
      const name = /name:\s*(.+)/.exec(fm)?.[1]?.trim() ?? f.replace(/\.md$/, "");
      const description = /description:\s*(.+)/.exec(fm)?.[1]?.trim() ?? "";
      out.push({ name, description, body });
    }
  } catch {
    // no skills bundled
  }
  cache = out;
  return out;
}
