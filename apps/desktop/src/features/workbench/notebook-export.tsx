import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { StatementResult } from "@/lib/ipc";

/**
 * Export the whole notebook — markdown notes, SQL cells with their result
 * tables, and rendered Mermaid diagrams — as a single document (Markdown, a
 * self-contained HTML file, or PDF via the print dialog).
 */
export type ExportCell = {
  type: "sql" | "markdown" | "mermaid";
  src: string;
  result?: StatementResult | null;
};
export { EXPORT_ALL, filterExportCells, type ExportInclude } from "./notebook-export-include";

const ROW_CAP = 500;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/* ─────────────────────────── Markdown export ─────────────────────────── */

const mdCell = (v: unknown) => cellText(v).replace(/\|/g, "\\|").replace(/\n/g, " ");

function resultToMarkdown(r: StatementResult): string {
  if (r.error) return `> **Error:** ${r.error}`;
  if (r.kind === "rowCount" || !r.columns.length) return `_${r.rowCount} row(s) affected · ${r.elapsedMs} ms_`;
  const head = `| ${r.columns.map((c) => mdCell(c.name)).join(" | ")} |`;
  const sep = `| ${r.columns.map(() => "---").join(" | ")} |`;
  const body = r.rows.slice(0, ROW_CAP).map((row) => `| ${row.map(mdCell).join(" | ")} |`);
  const more = r.rows.length > ROW_CAP ? `\n\n_…${r.rows.length - ROW_CAP} more rows not shown._` : "";
  const meta = `\n\n_${r.rowCount} rows · ${r.elapsedMs} ms${r.truncated ? " · truncated" : ""}_`;
  return [head, sep, ...body].join("\n") + more + meta;
}

export function buildNotebookMarkdown(title: string, cells: ExportCell[]): string {
  const out: string[] = [`# ${title}`, "", `_Exported from Exasol Studio · ${new Date().toLocaleString()}_`, "", "---", ""];
  for (const c of cells) {
    const src = c.src.trim();
    if (c.type === "markdown") {
      if (src) out.push(src, "");
    } else if (c.type === "mermaid") {
      if (src) out.push("```mermaid", src, "```", "");
    } else {
      if (src) out.push("```sql", src, "```", "");
      if (c.result) out.push(resultToMarkdown(c.result), "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ───────────────────────────── HTML / PDF ────────────────────────────── */

function resultToHtml(r: StatementResult): string {
  if (r.error) return `<p class="err">Error: ${esc(r.error)}</p>`;
  if (r.kind === "rowCount" || !r.columns.length) return `<p class="muted">${r.rowCount} row(s) affected · ${r.elapsedMs} ms</p>`;
  const cols = r.columns.map((c) => `<th>${esc(c.name)}</th>`).join("");
  const rows = r.rows
    .slice(0, ROW_CAP)
    .map((row) => `<tr>${row.map((v) => `<td>${esc(cellText(v))}</td>`).join("")}</tr>`)
    .join("");
  const more = r.rows.length > ROW_CAP ? `<p class="muted">…${r.rows.length - ROW_CAP} more rows not shown.</p>` : "";
  return `<div class="tablewrap"><table><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table></div><p class="muted">${r.rowCount} rows · ${r.elapsedMs} ms${r.truncated ? " · truncated" : ""}</p>${more}`;
}

function mdToHtml(md: string): string {
  // rehype-raw lets inline HTML the WYSIWYG emits (e.g. <u>) survive.
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {md}
    </ReactMarkdown>,
  );
}

async function renderMermaid(code: string, i: number): Promise<string> {
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
    const { svg } = await mermaid.render(`nb-export-${i}`, code.trim());
    return svg;
  } catch {
    return `<pre class="sql"><code>${esc(code)}</code></pre>`;
  }
}

export async function buildNotebookHtml(title: string, cells: ExportCell[]): Promise<string> {
  const sections: string[] = [];
  let m = 0;
  for (const c of cells) {
    const src = c.src.trim();
    if (c.type === "markdown") {
      if (src) sections.push(`<section class="md">${mdToHtml(src)}</section>`);
    } else if (c.type === "mermaid") {
      if (src) sections.push(`<section class="diagram">${await renderMermaid(src, m++)}</section>`);
    } else {
      let s = "";
      if (src) s += `<pre class="sql"><code>${esc(src)}</code></pre>`;
      if (c.result) s += resultToHtml(c.result);
      if (s) sections.push(`<section>${s}</section>`);
    }
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1c1e; background: #fff; max-width: 860px; margin: 40px auto; padding: 0 28px; line-height: 1.6; }
  h1 { font-size: 28px; margin: 0 0 2px; }
  h2 { font-size: 20px; margin: 24px 0 8px; }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  .sub { color: #6e6e73; font-size: 12px; margin: 0 0 24px; }
  section { margin: 14px 0; }
  section.md { margin: 10px 0; }
  section.diagram { text-align: center; margin: 20px 0; }
  section.diagram svg { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  img { max-width: 100%; border-radius: 8px; }
  ul, ol { padding-left: 1.4em; }
  blockquote { margin: .8em 0; border-left: 3px solid #d1d1d6; padding-left: .9em; color: #48484a; }
  /* EVERY code block (SQL cells AND fenced blocks inside markdown cells)
     gets the same treatment — issue #1: md code blocks exported unstyled. */
  pre { background: #f5f5f7; border: 1px solid #e5e5ea; border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 10px 0; }
  pre code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #1c1c1e; white-space: pre; background: none; border: none; padding: 0; }
  code { background: #f5f5f7; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  hr { border: none; border-top: 1px solid #e5e5ea; margin: 20px 0; }
  section.md table { display: block; overflow-x: auto; }
  input[type="checkbox"] { margin-right: 6px; }
  li.task-list-item { list-style: none; margin-left: -1.4em; }
  .tablewrap { overflow-x: auto; margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { border: 1px solid #e5e5ea; padding: 5px 9px; text-align: left; white-space: nowrap; }
  th { background: #f5f5f7; font-weight: 600; }
  .muted { color: #6e6e73; font-size: 11.5px; margin: 4px 0 0; }
  .err { color: #c0392b; font-size: 12.5px; }
  @media print { body { margin: 0 auto; } section { break-inside: avoid; } }
</style></head>
<body>
<h1>${esc(title)}</h1>
<p class="sub">Exported from Exasol Studio · ${new Date().toLocaleString()}</p>
${sections.join("\n")}
</body></html>`;
}

/** Print an HTML document via a hidden iframe (system dialog → Save as PDF). */
export function printNotebookHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* surfaced via the export note */
    }
    setTimeout(() => frame.remove(), 120_000);
  };
  frame.srcdoc = html;
}
