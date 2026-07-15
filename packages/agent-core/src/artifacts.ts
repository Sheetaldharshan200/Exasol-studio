import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Artifacts: self-contained HTML pages the agent renders as a tab in the app
// (insights, reports, mini-tools). Stored as files so they persist and reopen.

export type Artifact = { id: string; title: string; html: string; createdAt: number };

export class ArtifactStore {
  private readonly dir: string;
  constructor(dataDir: string) {
    this.dir = join(dataDir, "artifacts");
    mkdirSync(this.dir, { recursive: true });
  }
  save(title: string, html: string, id?: string): Artifact {
    const a: Artifact = { id: id || randomUUID().slice(0, 8), title: title || "Artifact", html, createdAt: Date.now() };
    writeFileSync(join(this.dir, `${a.id}.json`), JSON.stringify(a));
    return a;
  }
  get(id: string): Artifact | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, `${id.replace(/[^\w-]/g, "")}.json`), "utf8")) as Artifact;
    } catch {
      return null;
    }
  }
}
