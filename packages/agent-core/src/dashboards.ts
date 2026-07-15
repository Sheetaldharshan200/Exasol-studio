import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Dashboards-as-JSON: the agent (and the user) edit the same declarative
// spec; the app renders it with ECharts + a grid. No Superset, no server.

export const PanelSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  grid: z.object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(2).max(12),
    h: z.number().int().min(2).max(24),
  }),
  query: z.object({
    sql: z.string().min(1).describe("A SELECT producing the panel's data"),
  }),
  viz: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("echarts"),
      /** Constrained ECharts option: data is injected as dataset.source. */
      chart: z.enum(["bar", "line", "area", "pie", "scatter"]),
      /** Column for categories/x-axis (first column if omitted). */
      xField: z.string().optional(),
      /** Value columns to plot (all numeric columns if omitted). */
      yFields: z.array(z.string()).optional(),
      stacked: z.boolean().optional(),
      /** Raw ECharts option overrides, deep-merged over the generated option — full control. */
      option: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
      type: z.literal("kpi"),
      /** Column holding the headline value (first cell if omitted). */
      valueField: z.string().optional(),
      unit: z.string().optional(),
    }),
    z.object({ type: z.literal("table") }),
    z.object({
      type: z.literal("explore"),
      /** Perspective viewer config (group_by, split_by, aggregates, plugin…). */
      config: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
});

export const DashboardSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  panels: z.array(PanelSchema).min(1).max(24),
});

export type Dashboard = z.infer<typeof DashboardSchema>;

export class DashboardStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "dashboards");
    mkdirSync(this.dir, { recursive: true });
  }

  list(): { id: string; title: string; description: string; panels: number; updatedAt: number }[] {
    const out = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const d = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as Dashboard & { updatedAt?: number };
        out.push({
          id: d.id,
          title: d.title,
          description: d.description ?? "",
          panels: d.panels?.length ?? 0,
          updatedAt: d.updatedAt ?? 0,
        });
      } catch {
        // skip corrupt files
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Dashboard | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, `${sanitize(id)}.json`), "utf8")) as Dashboard;
    } catch {
      return null;
    }
  }

  /** Validate + persist. Returns the parsed dashboard or throws with details. */
  save(input: unknown): Dashboard {
    const raw = input as Record<string, unknown>;
    if (raw && typeof raw === "object" && !raw.id) raw.id = randomUUID().slice(0, 8);
    const parsed = DashboardSchema.parse(raw);
    writeFileSync(
      join(this.dir, `${sanitize(parsed.id)}.json`),
      JSON.stringify({ ...parsed, updatedAt: Date.now() }, null, 2),
    );
    return parsed;
  }

  delete(id: string): boolean {
    try {
      unlinkSync(join(this.dir, `${sanitize(id)}.json`));
      return true;
    } catch {
      return false;
    }
  }
}

function sanitize(id: string): string {
  return id.replace(/[^\w.-]/g, "_");
}
