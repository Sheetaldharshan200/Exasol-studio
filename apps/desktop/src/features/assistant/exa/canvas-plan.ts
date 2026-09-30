// The agent's ```canvas fence: boxes to add to the open canvas. Sources are
// named — an existing box's title (schema.table or a step's name) or another
// box in the same plan by its `name` — so the agent never needs internal ids.

export type PlanQuery = { kind: "query"; name: string; sql: string; source?: string | string[] };
export type PlanChart = { kind: "chart"; name: string; source: string; chart: string; xField?: string; yFields?: string[]; stacked?: boolean };
export type PlanBox = PlanQuery | PlanChart;
export type CanvasPlan = { title?: string; boxes: PlanBox[] };

export const CHART_KINDS = new Set(["bar", "hbar", "line", "area", "pie", "donut", "scatter", "radar", "funnel", "treemap", "heatmap", "gauge"]);

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** The plan in a fence, or null when the block is not one. */
export function parseCanvasPlan(code: string): CanvasPlan | null {
  let v: { title?: unknown; boxes?: unknown };
  try {
    v = JSON.parse(code);
  } catch {
    return null;
  }
  if (!v || !Array.isArray(v.boxes) || !v.boxes.length) return null;
  const boxes: PlanBox[] = [];
  const names = new Set<string>();
  for (const raw of v.boxes as Record<string, unknown>[]) {
    if (!raw || !str(raw.name) || names.has(raw.name)) return null;
    if (raw.kind === "query") {
      if (!str(raw.sql)) return null;
      const source = Array.isArray(raw.source) ? raw.source.filter(str) : str(raw.source) ? raw.source : undefined;
      if (Array.isArray(raw.source) && source && source.length !== raw.source.length) return null;
      boxes.push({ kind: "query", name: raw.name, sql: raw.sql, ...(source ? { source } : {}) });
    } else if (raw.kind === "chart") {
      if (!str(raw.source) || !str(raw.chart) || !CHART_KINDS.has(raw.chart)) return null;
      const yFields = Array.isArray(raw.yFields) ? raw.yFields.filter(str) : undefined;
      boxes.push({
        kind: "chart",
        name: raw.name,
        source: raw.source,
        chart: raw.chart,
        ...(str(raw.xField) ? { xField: raw.xField } : {}),
        ...(yFields?.length ? { yFields } : {}),
        ...(typeof raw.stacked === "boolean" ? { stacked: raw.stacked } : {}),
      });
    } else {
      return null;
    }
    names.add(raw.name);
  }
  return { ...(str(v.title) ? { title: v.title } : {}), boxes };
}

export function planSummary(plan: CanvasPlan): string {
  const q = plan.boxes.filter((b) => b.kind === "query").length;
  const c = plan.boxes.length - q;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [q ? part(q, "query") : "", c ? part(c, "chart") : ""].filter(Boolean).join(" · ");
}

/** The fence contract, as told to the agent. */
export const CANVAS_FENCE_DIRECTIVE =
  "When the user is on the query CANVAS (the prompt carries a 'Canvas' context with its boxes) and asks for a query, a chart, or an analysis step, FINISH with a ```canvas fenced block — " +
  'JSON {"title"?: string, "boxes": [{"kind": "query", "name": string, "sql": string, "source"?: string | string[]}, {"kind": "chart", "name": string, "source": string, "chart": "bar"|"line"|"area"|"pie"|"scatter", "xField"?: string, "yFields"?: string[]}]}. ' +
  "A query's source is the title of a canvas box (schema.table or a step name) or the name of an earlier box in the same plan; its SQL reads that source as derived_table (or source_1, source_2 when it names several). " +
  "A chart's source is a query or table box. The app renders the block as an 'Add to canvas' card that creates the boxes, draws their arrows and runs them, so every SQL must be complete and runnable.";
