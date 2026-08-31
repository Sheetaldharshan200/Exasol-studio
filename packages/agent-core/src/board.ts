/**
 * TurnBoard — shared, typed state for one turn's multi-agent work.
 * Researchers submit STRUCTURED findings (tables, tested SQL, facts) instead
 * of prose blobs; every subsequent spawn sees what's already known, and the
 * supervisor's continuation nudges cite it. This is the "blackboard"
 * topology: parallel workers, one shared memory, no framework required.
 */

export type Finding = {
  kind: "table" | "sql" | "fact";
  /** table findings */
  schema?: string;
  table?: string;
  columns?: string[];
  /** sql findings */
  purpose?: string;
  sql?: string;
  tested?: boolean;
  rows?: number;
  /** any */
  note?: string;
};

type Task = {
  id: number;
  task: string;
  status: "running" | "done" | "failed";
  findings: Finding[];
  summary?: string;
};

export class TurnBoard {
  private tasks: Task[] = [];
  private seq = 0;

  begin(task: string): number {
    const id = ++this.seq;
    this.tasks.push({ id, task, status: "running", findings: [] });
    return id;
  }

  complete(id: number, ok: boolean, findings: Finding[], summary?: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = ok ? "done" : "failed";
    t.findings = findings;
    t.summary = summary;
  }

  get size(): number {
    return this.tasks.length;
  }

  allFindings(): Finding[] {
    return this.tasks.flatMap((t) => t.findings);
  }

  /** Compact, injectable digest of everything gathered this turn. */
  digest(): string {
    if (!this.tasks.length) return "";
    const lines: string[] = [];
    for (const t of this.tasks) {
      lines.push(`- [${t.status}] ${t.task}${t.summary ? ` — ${t.summary.slice(0, 160)}` : ""}`);
      for (const f of t.findings.slice(0, 8)) {
        if (f.kind === "table" && f.table) {
          lines.push(`    table ${f.schema ? `${f.schema}.` : ""}${f.table}${f.columns?.length ? ` (${f.columns.slice(0, 10).join(", ")})` : ""}`);
        } else if (f.kind === "sql" && f.sql) {
          lines.push(`    sql${f.tested ? " ✓tested" : ""}${f.purpose ? ` [${f.purpose.slice(0, 60)}]` : ""}: ${f.sql.replace(/\s+/g, " ").slice(0, 180)}`);
        } else if (f.note) {
          lines.push(`    fact: ${f.note.slice(0, 160)}`);
        }
      }
    }
    return lines.join("\n");
  }
}
