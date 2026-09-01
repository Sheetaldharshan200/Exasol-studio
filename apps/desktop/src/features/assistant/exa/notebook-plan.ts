// Parses the agent's ```notebook fence — the contract behind the chat's
// "Create notebook" card. Pure and tested: model output is untrusted, so
// everything is validated and clamped before it becomes a notebook.

export type PlanCell = { type: "sql" | "markdown" | "mermaid"; src: string; chart?: string };
export type NotebookPlan = { title: string; cells: PlanCell[] };

const CELL_TYPES = new Set(["sql", "markdown", "mermaid"]);
const CHARTS = new Set(["bar", "line", "area", "pie", "scatter"]);
const MAX_CELLS = 40;
const MAX_SRC = 20_000;

/** Null when the block isn't a usable plan — the caller falls back to
 *  rendering the raw fence so nothing is silently swallowed. */
export function parseNotebookPlan(code: string): NotebookPlan | null {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { title, cells } = raw as { title?: unknown; cells?: unknown };
  if (!Array.isArray(cells) || cells.length === 0) return null;
  const out: PlanCell[] = [];
  for (const c of cells.slice(0, MAX_CELLS)) {
    if (typeof c !== "object" || c === null) continue;
    const { type, src, chart } = c as { type?: unknown; src?: unknown; chart?: unknown };
    if (typeof type !== "string" || !CELL_TYPES.has(type)) continue;
    if (typeof src !== "string" || !src.trim()) continue;
    const cell: PlanCell = { type: type as PlanCell["type"], src: src.slice(0, MAX_SRC) };
    if (type === "sql" && typeof chart === "string" && CHARTS.has(chart)) cell.chart = chart;
    out.push(cell);
  }
  if (out.length === 0) return null;
  return {
    title: typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "AI notebook",
    cells: out,
  };
}

/** One-line label for a cell in the card's preview list. */
export function cellLabel(cell: PlanCell): string {
  const first = cell.src.split("\n").find((l) => l.trim()) ?? "";
  const text = first.replace(/^#+\s*|^--\s*/, "").trim();
  return text.length > 70 ? `${text.slice(0, 70)}…` : text || cell.type;
}
