/**
 * "What next?" chips under an assistant reply — derived from the reply text
 * alone, deterministically. No extra model call, so they appear instantly and
 * never invent anything the reply did not contain.
 */
export type NextAction =
  | { kind: "run-sql"; label: "Run it"; sql: string }
  | { kind: "open-sql"; label: "Open in editor"; sql: string }
  | { kind: "explain-plan"; label: "Explain the plan"; sql: string }
  | { kind: "visualize"; label: "Visualize these"; tables: string[] }
  | { kind: "chart"; label: "Chart it" }
  | { kind: "dashboard"; label: "Add to a dashboard" }
  | { kind: "fix"; label: "Fix it" };

export type ReplyContext = {
  /** Known `SCHEMA.TABLE` names, to recognise table references in prose. */
  tables: string[];
};

const SQL_FENCE = /```sql\s*\n([\s\S]*?)```/i;
const ERROR_CUE = /\b(error|failed|exception|syntax error|not found|permission denied)\b/i;
const DATE_LIKE = /^\d{4}(-\d{2}){0,2}$|^\d{4}-Q[1-4]$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

export function suggestNextActions(reply: string, ctx: ReplyContext): NextAction[] {
  const out: NextAction[] = [];
  const fence = SQL_FENCE.exec(reply);
  const sql = fence?.[1].trim();
  if (sql) {
    if (/^\s*(select|with)\b/i.test(sql)) out.push({ kind: "run-sql", label: "Run it", sql });
    out.push({ kind: "open-sql", label: "Open in editor", sql });
    if (/^\s*(select|with)\b/i.test(sql)) out.push({ kind: "explain-plan", label: "Explain the plan", sql });
    return out.slice(0, 3);
  }
  if (ERROR_CUE.test(reply) && /```/.test(reply)) return [{ kind: "fix", label: "Fix it" }];

  // A markdown table whose first column looks like time → chart / dashboard.
  const table = firstMarkdownTable(reply);
  if (table && table.rows.length >= 2 && table.rows.every((r) => DATE_LIKE.test(r[0]))) {
    out.push({ kind: "chart", label: "Chart it" }, { kind: "dashboard", label: "Add to a dashboard" });
  }
  // Table references the catalog knows → visualize them together.
  const mentioned = ctx.tables.filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reply));
  if (mentioned.length >= 1) out.push({ kind: "visualize", label: "Visualize these", tables: mentioned.slice(0, 8) });
  return out.slice(0, 3);
}

function firstMarkdownTable(md: string): { header: string[]; rows: string[][] } | null {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length - 2; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().slice(1, -1).split("|").map((c) => c.trim());
      const header = cells(lines[i]);
      const rows: string[][] = [];
      for (let j = i + 2; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j++) rows.push(cells(lines[j]));
      return { header, rows };
    }
  }
  return null;
}
