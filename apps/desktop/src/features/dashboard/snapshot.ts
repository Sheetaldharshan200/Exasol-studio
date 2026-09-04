// Dashboard snapshot export — turns a dashboard plus its last cached results into
// a self-contained HTML page or a Markdown document that renders with no server
// and no database. This is both the "Export" output and the offline fallback a
// live share serves while the owner's machine is off. Pure and DOM-free so it is
// unit-tested; charts render as their underlying data table (a snapshot has no JS
// runtime), which keeps the export honest and offline-safe.

import type { DashboardDoc, Widget } from "./model.ts";
import type { CachedResult } from "./store.ts";

export type Snapshot = { html: string; md: string };

const escHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal, safe Markdown → HTML for the snapshot (pure, no React). Handles
 *  headings, bold/italic/code, links, and unordered/ordered lists. */
function mdToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  let ul = false, ol = false;
  const close = () => {
    if (ul) { out.push("</ul>"); ul = false; }
    if (ol) { out.push("</ol>"); ol = false; }
  };
  for (const line of src.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const u = /^\s*[-*+]\s+(.*)$/.exec(line);
    const o = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (h) { close(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (u) { if (ol) { out.push("</ol>"); ol = false; } if (!ul) { out.push("<ul>"); ul = true; } out.push(`<li>${inline(u[1])}</li>`); }
    else if (o) { if (ul) { out.push("</ul>"); ul = false; } if (!ol) { out.push("<ol>"); ol = true; } out.push(`<li>${inline(o[1])}</li>`); }
    else if (line.trim() === "") { close(); }
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join("");
}

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function widgetTitle(w: Widget): string {
  return (w.props?.title as string) ?? (w.type === "chart" ? `${(w.props?.kind as string) ?? "chart"} chart` : w.type);
}

/** Pull a headline value for a KPI from its cached first row. */
function kpiFromCache(c?: CachedResult): { label: string; value: string } {
  if (c?.value !== undefined && c.value !== null) return { label: c.columns?.[0] ?? "", value: String(c.value) };
  const v = c?.rows?.[0]?.[0];
  return { label: c?.columns?.[0] ?? "", value: v === undefined || v === null ? "—" : String(v) };
}

function tableHtml(c?: CachedResult): string {
  if (!c?.columns?.length || !c.rows?.length) return `<p class="empty">No cached data.</p>`;
  const head = c.columns.map((h) => `<th>${escHtml(h)}</th>`).join("");
  const body = c.rows
    .slice(0, 500)
    .map((r) => `<tr>${r.map((v) => `<td>${escHtml(cell(v))}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tableMd(c?: CachedResult): string {
  if (!c?.columns?.length || !c.rows?.length) return "_No cached data._";
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const head = `| ${c.columns.map(esc).join(" | ")} |`;
  const sep = `| ${c.columns.map(() => "---").join(" | ")} |`;
  const rows = c.rows.slice(0, 500).map((r) => `| ${r.map((v) => esc(cell(v))).join(" | ")} |`);
  return [head, sep, ...rows].join("\n");
}

const HTML_STYLE = `
  /* Palette taken from the Exasol Studio app theme (light + dark). */
  :root { color-scheme: light dark; --bg:#f4f7fb; --fg:#0b1730; --muted:#566481; --border:#dce3ee; --card:#ffffff; --th:#eaeff6; --accent:#4fa823; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0a0a0b; --fg:#f4f4f5; --muted:#8a8a90; --border:rgba(255,255,255,.10); --card:#111113; --th:#1c1c1f; --accent:#5fc33b; } }
  :root[data-theme="dark"] { --bg:#0a0a0b; --fg:#f4f4f5; --muted:#8a8a90; --border:rgba(255,255,255,.10); --card:#111113; --th:#1c1c1f; --accent:#5fc33b; }
  :root[data-theme="light"] { --bg:#f4f7fb; --fg:#0b1730; --muted:#566481; --border:#dce3ee; --card:#ffffff; --th:#eaeff6; --accent:#4fa823; }
  .md h1 { font-size:20px; font-weight:700; margin:2px 0 6px; }
  .md h2 { font-size:16px; font-weight:600; margin:8px 0 4px; }
  .md h3 { font-size:14px; font-weight:600; margin:6px 0 3px; }
  .md p { margin:0 0 6px; }
  .md ul, .md ol { margin:0 0 6px; padding-left:20px; }
  .md li { margin:1px 0; }
  .md code { background:var(--th); border-radius:4px; padding:1px 4px; font-family:ui-monospace,monospace; font-size:.9em; }
  .md a { color:var(--accent); }
  .md strong { font-weight:600; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 32px; max-width: 1220px; margin-inline: auto; background: var(--bg); color: var(--fg); transition: background .2s, color .2s; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: -.01em; margin: 0 0 2px; }
  .themebtn { position: fixed; top: 16px; right: 16px; z-index: 50; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--fg); font-size: 12px; cursor: pointer; }
  .themebtn:hover { border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(12, 1fr); grid-auto-rows: 76px; gap: 12px; margin-top: 16px; }
  .cell { display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
  .cell .caption { font-size: 12px; color: var(--muted); font-weight: 500; margin: 0 0 6px; }
  .cell .chart { flex: 1; min-height: 0; width: 100%; }
  .cell .chart img.chartfallback { width: 100%; height: 100%; object-fit: contain; }
  .cell.kpi { justify-content: center; }
  .kpi .v { font-size: 30px; font-weight: 700; letter-spacing: -.02em; }
  .kpi .l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-top: 2px; }
  .tablewrap { flex: 1; min-height: 0; overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td, th { border: 1px solid var(--border); padding: 5px 8px; text-align: left; }
  th { background: var(--th); position: sticky; top: 0; font-weight: 600; }
  .md h1, .md h2, .md h3 { margin: 0 0 6px; }
  .filterbox { align-self: flex-start; }
  .filterbox .l { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .empty { color: var(--muted); font-style: italic; }
  .foot { margin-top: 24px; font-size: 11px; color: var(--muted); }
`;

/** The always-present chrome: theme init + toggle. Charts (if interactive) add more. */
function themeScript(): string {
  return `<script>(function(){var s=localStorage.getItem('exa-theme');if(s)document.documentElement.setAttribute('data-theme',s);window.__toggleTheme=function(){var d=document.documentElement,c=d.getAttribute('data-theme'),m=matchMedia('(prefers-color-scheme: dark)').matches,n=c==='dark'?'light':c==='light'?'dark':(m?'light':'dark');d.setAttribute('data-theme',n);localStorage.setItem('exa-theme',n);if(window.__renderCharts)window.__renderCharts();};})();</script>`;
}

export type SnapshotOpts = {
  chartImages?: Record<string, string>;
  /** Per-chart echarts option for INTERACTIVE (hover-tooltip) rendering. */
  chartOptions?: Record<string, unknown>;
  /** echarts source to inline so the interactive charts work offline. */
  runtimeJs?: string;
};

/** Build the HTML + Markdown snapshot of a dashboard from its cached results.
 *  With `chartOptions` + `runtimeJs` the charts are INTERACTIVE (hover tooltips,
 *  theme-aware) and the page has a light/dark toggle — a self-contained artifact.
 *  Falls back to the captured image, then the data table. */
export function buildSnapshot(doc: DashboardDoc, cache: Record<string, CachedResult> = {}, generatedAt?: string, opts: SnapshotOpts = {}): Snapshot {
  const chartImages = opts.chartImages ?? {};
  const chartOptions = opts.chartOptions ?? {};
  const interactive = Boolean(opts.runtimeJs && Object.keys(chartOptions).length);
  const cells: string[] = [];
  const mdParts: string[] = [`# ${doc.title}`];

  for (const w of doc.widgets) {
    const c = cache[w.id];
    const title = widgetTitle(w);
    const userTitle = w.props?.title as string | undefined;
    // Position the cell exactly like the in-app grid.
    const { x, y, w: cw, h: ch } = w.layout;
    const pos = `grid-column:${x + 1}/span ${cw};grid-row:${y + 1}/span ${ch}`;
    let inner = "";
    let cls = "cell";

    switch (w.type) {
      case "markdown": {
        const text = (w.props?.text as string) ?? "";
        inner = `<div class="md">${mdToHtml(text)}</div>`;
        mdParts.push(text);
        break;
      }
      case "kpi": {
        const k = kpiFromCache(c);
        cls = "cell kpi";
        inner = `<div class="v">${escHtml(k.value)}</div><div class="l">${escHtml(userTitle || k.label)}</div>`;
        mdParts.push(`**${k.value}** — ${userTitle || k.label}`);
        break;
      }
      case "chart":
      case "table": {
        const img = w.type === "chart" ? chartImages[w.id] : undefined;
        if (userTitle) inner += `<div class="caption">${escHtml(userTitle)}</div>`;
        if (w.type === "chart" && (img || (interactive && chartOptions[w.id]))) {
          // Interactive chart mounts here; the captured image is the fallback.
          const fallback = img ? `<img class="chartfallback" src="${img}" alt="${escHtml(title)}" />` : "";
          inner += `<div class="chart" data-chart="${escHtml(w.id)}">${fallback}</div>`;
        } else {
          inner += `<div class="tablewrap">${tableHtml(c)}</div>`;
        }
        mdParts.push(`### ${title}`, tableMd(c));
        break;
      }
      case "filter":
      case "search": {
        const param = (w.props?.param as string) ?? w.type;
        const value = c?.value !== undefined ? String(c.value) : "All";
        inner = `<div class="filterbox"><div class="l">${escHtml(param)}</div><div>${escHtml(value)}</div></div>`;
        break;
      }
      default:
        continue;
    }
    cells.push(`<div class="${cls}" style="${pos}">${inner}</div>`);
  }

  const foot = generatedAt ? `Generated ${escHtml(generatedAt)}` : "";
  const themeBtn = `<button class="themebtn" onclick="__toggleTheme()" title="Toggle light / dark">◐ Theme</button>`;
  const chartScript = interactive ? interactiveChartScript(opts.runtimeJs!, chartOptions) : "";
  const body = `${themeBtn}<h1>${escHtml(doc.title)}</h1><div class="grid">${cells.join("")}</div>${foot ? `<div class="foot">${foot}</div>` : ""}${themeScript()}${chartScript}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(doc.title)}</title><style>${HTML_STYLE}</style></head><body>${body}</body></html>`;
  const md = mdParts.join("\n\n") + (foot ? `\n\n_${foot}_` : "");
  return { html, md };
}

/** Inline echarts + render each embedded option as an interactive, theme-aware
 *  chart (hover tooltips), replacing the fallback image. */
function interactiveChartScript(runtimeJs: string, options: Record<string, unknown>): string {
  const data = JSON.stringify(options).replace(/</g, "\\u003c");
  return (
    `<script>${runtimeJs}</script>` +
    `<script>(function(){window.__CHARTS=${data};var insts={};` +
    `window.__renderCharts=function(){` +
    `var d=(document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark';` +
    `var fg=d?'#8a8a90':'#566481';` +
    `Object.keys(window.__CHARTS).forEach(function(id){var host=document.querySelector('[data-chart="'+id+'"]');if(!host||!window.echarts)return;` +
    `try{var inst=echarts.getInstanceByDom(host)||echarts.init(host);insts[id]=inst;var o=JSON.parse(JSON.stringify(window.__CHARTS[id]));` +
    `o.textStyle={color:fg};o.tooltip=Object.assign({trigger:'axis',appendToBody:true},o.tooltip||{});` +
    `inst.setOption(o);var img=host.querySelector('img');if(img)img.style.display='none';` +
    `if(!host.__ro){host.__ro=new ResizeObserver(function(){try{inst.resize();}catch(e){}});host.__ro.observe(host);}}catch(e){}});};` +
    `window.addEventListener('resize',function(){Object.keys(insts).forEach(function(id){try{insts[id].resize();}catch(e){}});});` +
    `if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',window.__renderCharts);}else{window.__renderCharts();}})();</script>`
  );
}
