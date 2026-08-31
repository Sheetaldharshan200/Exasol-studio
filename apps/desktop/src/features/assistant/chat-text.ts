/**
 * Pure text helpers for the assistant chat: scrubbing leaked tool-call JSON out
 * of assistant prose, reflowing collapsed markdown tables, splitting fenced
 * code, and formatting tool labels and timestamps.
 *
 * Extracted from AssistantPanel.tsx (~2,000 lines) where none of it was
 * reachable without mounting the panel. The scrubbing functions in particular
 * decide what the USER sees when a model misfires its chat template, so they
 * are exactly the kind of logic that needs tests rather than a manual look —
 * see chat-text.test.ts.
 */

/** Human-readable label per agent tool name, for the tool-activity chips. */
export const TOOL_LABELS: Record<string, string> = {
  list_schemas: "Listing schemas",
  list_tables: "Listing tables",
  describe_table: "Describing table",
  run_sql: "Running SQL",
  profile_query: "Profiling query",
  get_table_sample: "Sampling rows",
  remember_insight: "Saving insight",
  spawn_researcher: "Researcher",
  remember: "Saving to memory",
  kb_search: "Searching knowledge graph",
  kb_join_path: "Finding join path",
  kb_subsystem: "Mapping subsystem",
  kb_refresh: "Rebuilding knowledge graph",
  search_documents: "Searching documents",
  read_document: "Reading document",
  semantic_compile_request: "Compiling semantic query",
  semantic_compile_sql: "Compiling semantic SQL",
  app_ui_locate: "Locating in app",
  ui_connect: "Connecting the app",
  ui_open: "Opening in app",
  ui_editor_insert: "Inserting SQL",
  dashboard_save: "Saving dashboard",
  render_artifact: "Building artifact",
  load_skill: "Reading skill",
  dashboard_list: "Listing dashboards",
  dashboard_get: "Reading dashboard",
  list_connections: "Checking connections",
};

/** Split text into prose and fenced-code regions. A fence is ``` or ''' and
 *  runs until the matching marker (or end-of-text while the user is still
 *  typing). The markers are kept inside the code region so they highlight too. */
export function splitFences(s: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = [];
  const re = /(```|''')/g;
  let last = 0;
  let open: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const marker = m[1];
    if (open === null) {
      if (m.index > last) out.push({ code: false, text: s.slice(last, m.index) });
      open = marker;
      last = m.index;
    } else if (marker === open) {
      out.push({ code: true, text: s.slice(last, m.index + marker.length) });
      open = null;
      last = m.index + marker.length;
    }
  }
  if (open !== null) out.push({ code: true, text: s.slice(last) });
  else if (last < s.length) out.push({ code: false, text: s.slice(last) });
  return out;
}

export function relTime(ts: number, now: number = Date.now()): string {
  const d = now - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

/** One-line preview of a tool call's arguments for the activity chip. */
export function argPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const o = args as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ["task", "near", "query", "schema", "table", "sql", "purpose", "note"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) parts.push(k === "sql" ? v.replace(/\s+/g, " ").slice(0, 60) : v);
    if (parts.length >= 2) break;
  }
  return parts.join(" · ");
}

export function hasLeakedToolCall(s: string): boolean {
  const m = /\{\s*"name"\s*:\s*"([a-zA-Z0-9_]+)"/.exec(s);
  if (!m) return false;
  return m[1] in TOOL_LABELS || /"(?:arguments|parameters|args|input)"\s*:/.test(s);
}

/** Remove every `{"name":...}` tool-call object via brace-aware scanning; an
 *  unterminated one (streaming cut-off) drops everything from its start. */
export function stripToolJson(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const m = /\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"/.exec(s.slice(i));
    if (!m) return out + s.slice(i);
    const start = i + m.index;
    out += s.slice(i, start);
    let depth = 0;
    let inStr = false;
    let esc = false;
    let closed = false;
    let j = start;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { j++; closed = true; break; }
      }
    }
    if (!closed) return out; // truncated tool call — drop the tail
    i = j;
  }
  return out;
}

/**
 * Reflow a GFM table the model collapsed onto ONE line (header + `|---|`
 * separator + all rows glued together) back into real rows, so it renders as a
 * table instead of a jumbled line. Detects a line whose separator cells sit
 * inline with data, then re-chunks every cell into rows of column-count. Lines
 * without an inline separator (i.e. already-correct tables) are left untouched.
 */
export function reflowMarkdownTables(text: string): string {
  if (!text.includes("|") || !/\|\s*:?-{3,}:?\s*\|/.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      // Only collapsed lines: a separator cell AND data cells after it, same line.
      if (!/\|\s*:?-{3,}:?\s*\|.*\|.*\S/.test(line)) return line;
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
      const isSep = (c: string) => /^:?-{3,}:?$/.test(c);
      const firstSep = cells.findIndex(isSep);
      if (firstSep < 1) return line; // need at least one header cell before it
      let cols = 0;
      while (cells[firstSep + cols] && isSep(cells[firstSep + cols])) cols++;
      if (cols < 1 || firstSep !== cols) return line; // header count must equal sep count
      const header = cells.slice(0, cols);
      const body = cells.slice(cols * 2); // skip header + separator
      const rows: string[] = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
      for (let i = 0; i < body.length; i += cols) {
        const row = body.slice(i, i + cols);
        while (row.length < cols) row.push("");
        rows.push(`| ${row.join(" | ")} |`);
      }
      return rows.join("\n");
    })
    .join("\n");
}

export function cleanAssistant(raw: string): string {
  if (!raw) return raw;
  const reflowed = reflowMarkdownTables(raw);
  if (!hasLeakedToolCall(reflowed)) return reflowed;
  let t = stripToolJson(reflowed);
  // The misfire tangled the fences (JSON + prose in one block) — strip fence
  // markers so the remaining prose/list renders as normal chat. Remove opening
  // fences (```lang\n) first, then any bare ``` / '''. The two-step order keeps
  // a prose word glued to a closing fence (```It) intact.
  t = t.replace(/```[a-zA-Z0-9]+\n/g, "").replace(/```/g, "").replace(/'''/g, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
