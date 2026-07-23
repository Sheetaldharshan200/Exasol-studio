import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Dashboards-as-JSON: the agent (and the user) edit the same declarative
// spec; the app renders it with ECharts + a grid. No Superset, no server.

export const PanelSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().default(""),
    grid: z.object({
      x: z.number().int().min(0).max(11),
      y: z.number().int().min(0),
      w: z.number().int().min(2).max(12),
      h: z.number().int().min(2).max(24),
    }),
    /** Required for data panels; markdown panels carry no query. */
    query: z
      .object({
        sql: z.string().describe("A SELECT producing the panel's data"),
      })
      .optional(),
    viz: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("echarts"),
      /** Constrained ECharts option: data is injected as dataset.source. */
      chart: z.enum(["bar", "line", "area", "pie", "donut", "hbar", "scatter", "heatmap", "funnel", "radar", "treemap", "gauge"]),
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
      z.object({
        type: z.literal("markdown"),
        /** Narrative text rendered as markdown — headings, insight notes,
         *  methodology. Turns a dashboard into a sendable report. */
        content: z.string().min(1),
      }),
    ]),
  })
  .superRefine((p, ctx) => {
    if (p.viz.type !== "markdown" && !p.query?.sql?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["query"], message: "query.sql is required for every panel except markdown text panels" });
    }
  });

export const DashboardSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  /** Optional grouping in the dashboards list (e.g. "System"). */
  group: z.string().optional(),
  panels: z.array(PanelSchema).min(1).max(24),
});

export type Dashboard = z.infer<typeof DashboardSchema>;

export class DashboardStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "dashboards");
    mkdirSync(this.dir, { recursive: true });
  }

  list(): { id: string; title: string; description: string; group?: string; panels: number; updatedAt: number }[] {
    const out = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const d = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as Dashboard & { updatedAt?: number };
        out.push({
          id: d.id,
          title: d.title,
          description: d.description ?? "",
          group: (d as { group?: string }).group,
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
    // Normalize before validating — models forget ids/grids constantly and a
    // missing coordinate must not kill an otherwise good dashboard.
    if (Array.isArray(raw?.panels)) {
      raw.panels = (raw.panels as Record<string, unknown>[]).map((p, i) => {
        const viz = (p.viz ?? { type: "table" }) as Record<string, unknown>;
        if (viz.type === "echarts" && !viz.chart) viz.chart = "bar";
        const sql = typeof p.sql === "string" ? p.sql : ((p.query as Record<string, unknown>)?.sql as string) ?? "";
        return {
          id: typeof p.id === "string" && p.id ? p.id : `p${i + 1}`,
          title:
            typeof p.title === "string" && p.title
              ? p.title
              : typeof p.name === "string" && p.name
                ? p.name
                : deriveTitle(sql, String((viz as { type?: string }).type ?? "")),
          grid:
            p.grid && typeof p.grid === "object"
              ? p.grid
              : { x: (i % 2) * 6, y: Math.floor(i / 2) * 6, w: 6, h: 6 },
          query: p.query ?? (typeof p.sql === "string" ? { sql: p.sql } : p.query),
          viz,
        };
      });
    }
    const parsed = DashboardSchema.parse(raw);
    const path = join(this.dir, `${sanitize(parsed.id)}.json`);
    // Revision history (dash-server-inspired): every save snapshots the
    // previous version; keep the last 15, restorable via rollback().
    let revisions: unknown[] = [];
    try {
      const prev = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      revisions = Array.isArray(prev.revisions) ? (prev.revisions as unknown[]) : [];
      delete prev.revisions;
      revisions.unshift(prev);
      revisions = revisions.slice(0, 15);
    } catch {
      /* first save — no prior revision */
    }
    writeFileSync(path, JSON.stringify({ ...parsed, updatedAt: Date.now(), revisions }, null, 2));
    return parsed;
  }

  /** Revision metadata, newest first. */
  history(id: string): { index: number; updatedAt: number; title: string; panels: number }[] {
    try {
      const doc = JSON.parse(readFileSync(join(this.dir, `${sanitize(id)}.json`), "utf8")) as {
        revisions?: { updatedAt?: number; title?: string; panels?: unknown[] }[];
      };
      return (doc.revisions ?? []).map((r, index) => ({
        index,
        updatedAt: r.updatedAt ?? 0,
        title: r.title ?? "",
        panels: Array.isArray(r.panels) ? r.panels.length : 0,
      }));
    } catch {
      return [];
    }
  }

  /** Restore a revision (the current version becomes a revision itself). */
  rollback(id: string, index: number): Dashboard | null {
    try {
      const doc = JSON.parse(readFileSync(join(this.dir, `${sanitize(id)}.json`), "utf8")) as { revisions?: unknown[] };
      const rev = doc.revisions?.[index] as Record<string, unknown> | undefined;
      if (!rev) return null;
      return this.save({ ...rev, id });
    } catch {
      return null;
    }
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

/** A readable panel title from its SQL when the model didn't give one. */
function deriveTitle(sql: string, vizType: string): string {
  const humanize = (x: string) =>
    x.replace(/^[A-Z]_/i, "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const aliases = [...sql.matchAll(/\bAS\s+([A-Za-z_][\w]*)/gi)].map((m) => m[1]);
  const measure = aliases.find((a) => !/^(year|month|day|date|name|city|category|segment)$/i.test(a)) ?? aliases[0];
  const dim = [...sql.matchAll(/\bGROUP\s+BY\s+([A-Za-z_][\w.]*)/gi)][0]?.[1];
  if (measure && dim) return `${humanize(measure)} by ${humanize(dim.split(".").pop() ?? dim)}`;
  if (measure) return humanize(measure);
  const tbl = /\bFROM\s+[\w".]*?([A-Za-z_]\w*)\b/i.exec(sql)?.[1];
  if (tbl) return humanize(tbl);
  return vizType === "kpi" ? "Metric" : vizType === "table" ? "Table" : "Chart";
}

function sanitize(id: string): string {
  return id.replace(/[^\w.-]/g, "_");
}
