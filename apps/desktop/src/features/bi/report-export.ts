/**
 * Pure formatting and report-building helpers for dashboards: number
 * formatting, KPI text, markdown tables, minimal markdown→HTML, and the
 * markdown report export.
 *
 * Extracted from Dashboards.tsx (~2,000 lines) where none of it was reachable
 * without mounting the dashboard. `mdToHtml` escapes user- and database-derived
 * text into an exported HTML document, so its escaping is security-relevant and
 * is pinned by tests in report-export.test.ts.
 *
 * `chartPng`, `buildHtmlReport` and `printHtml` deliberately stay behind in the
 * component: they need echarts and a live DOM, so they are not pure.
 */
import type { DashPanel, Dashboard } from "@/lib/agent-client";
import type { StatementResult } from "@/lib/ipc";

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

export function fmtNumber(raw: unknown): string {
  // NULL and empty must NOT become 0. Number(null) and Number("") are both 0
  // and finite, so a NULL database cell used to render as "0" in a KPI tile —
  // indistinguishable from a real zero, which is exactly the wrong answer for a
  // revenue or count headline. Unknown renders as an em dash.
  if (raw === null || raw === undefined || raw === "") return "—";
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export function kpiText(panel: DashPanel, result: StatementResult): string {
  const viz = panel.viz as Extract<DashPanel["viz"], { type: "kpi" }>;
  const field = viz.valueField?.toUpperCase();
  const idx = field ? result.columns.findIndex((c) => c.name === field) : 0;
  const value = fmtNumber(result.rows[0]?.[Math.max(idx, 0)]);
  return viz.unit ? `${value} ${viz.unit}` : value;
}

export const MD_ROW_CAP = 50;

export function mdTable(result: StatementResult): string {
  const esc = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const cols = result.columns.map((c) => c.name);
  const rows = result.rows.slice(0, MD_ROW_CAP);
  const lines = [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ];
  if (result.rows.length > MD_ROW_CAP) lines.push("", `_…${result.rows.length - MD_ROW_CAP} more rows not shown._`);
  return lines.join("\n");
}

export function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  let inList = false;
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export function buildMarkdownReport(dash: Dashboard, panels: DashPanel[], data: Map<string, StatementResult | null>, now: Date = new Date()): string {
  const parts: string[] = [`# ${dash.title}`, ""];
  if (dash.description) parts.push(dash.description, "");
  parts.push(`_Exported from Exasol Studio · ${now.toLocaleString()}_`, "");
  for (const p of panels) {
    if (p.viz.type === "markdown") {
      parts.push(p.viz.content, "");
      continue;
    }
    parts.push(`## ${p.title || "Panel"}`, "");
    const r = data.get(p.id);
    if (!r) {
      parts.push("_No data (not connected or the query failed)._", "");
      continue;
    }
    if (p.viz.type === "kpi") parts.push(`**${kpiText(p, r)}**`, "");
    else parts.push(mdTable(r), "");
    if (p.query?.sql) parts.push("```sql", p.query.sql.trim(), "```", "");
  }
  return parts.join("\n");
}
