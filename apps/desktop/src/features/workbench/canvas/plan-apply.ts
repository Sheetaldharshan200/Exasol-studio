// Turning the agent's plan into boxes: names become ids, in order, so a
// chart can sit on a query from the same plan.

import type { CanvasPlan } from "@/features/assistant/exa/canvas-plan.ts";
import { boxTitle, type CanvasDoc } from "./model.ts";

export type PlanStep =
  | { kind: "query"; name: string; sql: string; sources: string[] }
  | { kind: "chart"; name: string; source: string; chart: string; xField?: string; yFields?: string[]; stacked?: boolean };

/**
 * Resolve every source name against the canvas (a box title) and against
 * earlier plan boxes (their names). The result is ordered for creation;
 * `ids` maps a plan name to the id it will get, so the caller allocates ids
 * up front and the steps refer to them.
 */
export function resolvePlan(plan: CanvasPlan, doc: CanvasDoc, allocate: (kind: "query" | "chart") => string): { steps: (PlanStep & { id: string })[]; errors: string[] } {
  const byTitle = new Map<string, string>();
  for (const b of doc.boxes) if (!byTitle.has(boxTitle(b))) byTitle.set(boxTitle(b), b.id);
  const planIds = new Map<string, string>();
  const errors: string[] = [];
  const steps: (PlanStep & { id: string })[] = [];
  const lookup = (name: string, owner: string): string | null => {
    const id = planIds.get(name) ?? byTitle.get(name) ?? byTitle.get(name.toUpperCase());
    if (!id) errors.push(`"${owner}" reads "${name}", which is neither on the canvas nor earlier in the plan.`);
    return id ?? null;
  };
  for (const b of plan.boxes) {
    const id = allocate(b.kind);
    if (b.kind === "query") {
      const names = Array.isArray(b.source) ? b.source : b.source ? [b.source] : [];
      const sources = names.map((n) => lookup(n, b.name)).filter((s): s is string => s !== null);
      if (sources.length !== names.length) continue;
      steps.push({ id, kind: "query", name: b.name, sql: b.sql, sources });
    } else {
      const source = lookup(b.source, b.name);
      if (!source) continue;
      steps.push({ id, kind: "chart", name: b.name, source, chart: b.chart, xField: b.xField, yFields: b.yFields, stacked: b.stacked });
    }
    planIds.set(b.name, id);
  }
  return { steps, errors };
}

/** The canvas as the agent should see it: what is on it and how each box is made. */
export function describeCanvas(doc: CanvasDoc, connectionName: string): string {
  if (!doc.boxes.length) return `Canvas on connection "${connectionName}": empty. Boxes you add read tables by their schema.table title.`;
  const byId = new Map(doc.boxes.map((b) => [b.id, b]));
  const lines = doc.boxes.map((b) => {
    if (b.kind === "table") return `- table "${boxTitle(b)}"${b.rowCount != null ? ` (${b.rowCount} rows)` : ""}`;
    if (b.kind === "query") {
      const srcs = b.sources.map((s) => byId.get(s)).filter(Boolean).map((s) => `"${boxTitle(s!)}"`).join(", ");
      return `- query "${b.name}" on ${srcs || "nothing"}:\n  ${b.sql.replace(/\s+/g, " ").trim()}`;
    }
    const src = byId.get(b.source);
    return `- chart "${b.name}" (${b.chart}${b.viz.xField ? `, by ${b.viz.xField}` : ""}${b.viz.yFields?.length ? `, measures ${b.viz.yFields.join("/")}` : ""}) on "${src ? boxTitle(src) : "?"}"`;
  });
  return `Canvas on connection "${connectionName}" — ${doc.boxes.length} boxes:\n${lines.join("\n")}`;
}
