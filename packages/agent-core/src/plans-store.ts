// P2 plan persistence: one JSON file per plan under <dataDir>/plans, plus a
// "current" pointer — the plan the panel shows. Deliberately tiny: validation
// and transitions live in plan.ts (pure, tested); this is only disk I/O.

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plan } from "./plan.ts";

export class PlanStore {
  private readonly dir: string;
  private readonly currentFile: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "plans");
    mkdirSync(this.dir, { recursive: true });
    this.currentFile = join(this.dir, "current.json");
  }

  save(plan: Plan, makeCurrent = true): void {
    writeFileSync(join(this.dir, `${plan.id}.json`), JSON.stringify(plan, null, 2));
    if (makeCurrent) writeFileSync(this.currentFile, JSON.stringify({ id: plan.id }));
  }

  get(id: string): Plan | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, `${id}.json`), "utf8")) as Plan;
    } catch {
      return null;
    }
  }

  current(): Plan | null {
    try {
      const { id } = JSON.parse(readFileSync(this.currentFile, "utf8")) as { id: string };
      return this.get(id);
    } catch {
      return null;
    }
  }

  clearCurrent(): void {
    try {
      unlinkSync(this.currentFile);
    } catch {
      /* nothing current */
    }
  }

  /** Newest first, capped — the panel's plan history. */
  recent(limit = 20): Plan[] {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.startsWith("plan-") && f.endsWith(".json"))
        .map((f) => this.get(f.replace(/\.json$/, "")))
        .filter((p): p is Plan => p !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}
