import { useMemo, useState } from "react";
import { Code2, KeyRound, Link2, Loader2, Plus, RotateCcw, Save, ShieldOff, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConstraintInfo } from "@/lib/ipc";

function qualify(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}

/** A constraint the user is adding in this session. */
type NewCon = {
  id: string;
  kind: "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY";
  name: string;
  cols: string;
  refTable: string;
  refCols: string;
};

/**
 * Keys & constraints editor for the Details → Keys tab. Lists existing
 * constraints (drop with the bin), stages new PRIMARY KEY / UNIQUE / FOREIGN
 * KEY constraints, then diffs to ALTER TABLE ... ADD/DROP CONSTRAINT. Same
 * two-button model as the rest of Studio: Review SQL / Confirm & Save.
 */
export function TableKeysEditor({
  schema,
  table,
  columns,
  constraints,
  onOpenSql,
  onApply,
  onDone,
}: {
  schema?: string;
  table: string;
  columns: string[];
  constraints: ConstraintInfo[];
  onOpenSql?: (sql: string, title?: string) => void;
  onApply?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  onDone: () => void;
}) {
  const t = qualify(schema, table);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [adds, setAdds] = useState<NewCon[]>([]);
  const [seq, setSeq] = useState(0);
  const [applyError, setApplyError] = useState<{ message: string; sql?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function addCon(kind: NewCon["kind"]) {
    const id = `n${seq}`;
    setSeq((s) => s + 1);
    setAdds((a) => [...a, { id, kind, name: `${kind === "PRIMARY KEY" ? "PK" : kind === "UNIQUE" ? "UQ" : "FK"}_${table}`, cols: "", refTable: "", refCols: "" }]);
  }
  function patch(id: string, p: Partial<NewCon>) {
    setAdds((a) => a.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  function toggleDrop(name: string) {
    setDropped((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  function reset() {
    setDropped(new Set());
    setAdds([]);
    setApplyError(null);
  }

  const colList = (raw: string) =>
    raw.split(",").map((s) => s.trim()).filter(Boolean).map((c) => `"${c}"`).join(", ");

  const statements = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const name of dropped) out.push(`ALTER TABLE ${t} DROP CONSTRAINT "${name}";`);
    for (const c of adds) {
      const cols = colList(c.cols);
      if (!cols) continue;
      if (c.kind === "FOREIGN KEY") {
        if (!c.refTable.trim() || !colList(c.refCols)) continue;
        out.push(`ALTER TABLE ${t} ADD CONSTRAINT "${c.name}" FOREIGN KEY (${cols}) REFERENCES "${c.refTable.trim()}" (${colList(c.refCols)});`);
      } else {
        out.push(`ALTER TABLE ${t} ADD CONSTRAINT "${c.name}" ${c.kind} (${cols});`);
      }
    }
    return out;
  }, [dropped, adds, t]);

  const dirty = statements.length > 0;

  async function save() {
    if (!onApply || !statements.length) return;
    setApplyError(null);
    setSaving(true);
    const r = await onApply(statements);
    setSaving(false);
    if (r?.ok) onDone();
    else setApplyError({ message: r?.error ?? "The change failed.", sql: r?.failedSql });
  }

  const colsHint = columns.length ? `Columns: ${columns.slice(0, 8).join(", ")}${columns.length > 8 ? "…" : ""}` : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Editing keys</span>
        <span className="font-mono text-[11px] text-muted-foreground">{t}</span>
        <button onClick={() => addCon("PRIMARY KEY")} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"><KeyRound className="h-3.5 w-3.5" /> Primary key</button>
        <button onClick={() => addCon("UNIQUE")} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Unique</button>
        <button onClick={() => addCon("FOREIGN KEY")} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"><Link2 className="h-3.5 w-3.5" /> Foreign key</button>
        <button onClick={reset} disabled={!dirty} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Revert</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { if (statements.length && onOpenSql) onOpenSql(statements.join("\n"), `Keys ${table}`); }} disabled={!dirty || saving || !onOpenSql} title="Open these changes as SQL in a new query tab" className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"><Code2 className="h-3.5 w-3.5" /> Review SQL</button>
          <button onClick={save} disabled={!dirty || saving || !onApply} title="Run these changes now" className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Confirm &amp; Save</button>
          <button onClick={onDone} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Done</button>
        </div>
      </div>

      {applyError ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2">
          <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-destructive">Change failed — your edits are kept. Fix and Save again, or use Review SQL.</p>
            <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{applyError.message}</p>
            {applyError.sql ? <p className="mt-1 break-all font-mono text-[10.5px] text-muted-foreground">{applyError.sql}</p> : null}
          </div>
          <button onClick={() => setApplyError(null)} aria-label="Dismiss" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {/* Existing constraints */}
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Existing constraints</p>
          {constraints.length ? (
            <table className="w-full border-collapse border border-border text-[12px]">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className="border border-border px-3 py-1.5 font-medium">Name</th>
                  <th className="border border-border px-3 py-1.5 font-medium">Type</th>
                  <th className="border border-border px-3 py-1.5 font-medium">Columns</th>
                  <th className="border border-border px-3 py-1.5 font-medium">References</th>
                  <th className="border border-border px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {constraints.map((c) => {
                  const willDrop = dropped.has(c.name);
                  return (
                    <tr key={c.name} className={cn("even:bg-secondary/20", willDrop && "opacity-45")}>
                      <td className={cn("border border-border px-3 py-1 text-foreground", willDrop && "line-through")}>{c.name}</td>
                      <td className="border border-border px-3 py-1 text-muted-foreground">{c.constraintType}</td>
                      <td className="border border-border px-3 py-1 text-muted-foreground">{c.columns.map((x) => x.column).join(", ")}</td>
                      <td className="border border-border px-3 py-1 text-muted-foreground">{c.columns[0]?.referencedTable ? `${c.columns[0].referencedTable} (${c.columns.map((x) => x.referencedColumn).join(", ")})` : ""}</td>
                      <td className="border border-border px-2 py-1 text-center">
                        <button onClick={() => toggleDrop(c.name)} title={willDrop ? "Keep this constraint" : "Drop this constraint"} className={cn("text-muted-foreground", willDrop ? "hover:text-foreground" : "hover:text-destructive")}>
                          {willDrop ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-muted-foreground">No constraints yet.</p>
          )}
        </div>

        {/* New constraints */}
        {adds.length ? (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">New constraints {colsHint ? <span className="ml-1 normal-case text-muted-foreground/70">· {colsHint}</span> : null}</p>
            {adds.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground">{c.kind}</span>
                  <input value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} placeholder="constraint_name" className="h-6 flex-1 rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus:bg-primary/5" />
                  <button onClick={() => setAdds((a) => a.filter((x) => x.id !== c.id))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </div>
                <label className="mb-1 block">
                  <span className="text-[10px] text-muted-foreground">Columns (comma-separated)</span>
                  <input value={c.cols} onChange={(e) => patch(c.id, { cols: e.target.value })} placeholder="col_a, col_b" className="mt-0.5 h-7 w-full rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus:bg-primary/5" />
                </label>
                {c.kind === "FOREIGN KEY" ? (
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-[10px] text-muted-foreground">References table</span>
                      <input value={c.refTable} onChange={(e) => patch(c.id, { refTable: e.target.value })} placeholder="OTHER_TABLE" className="mt-0.5 h-7 w-full rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus:bg-primary/5" />
                    </label>
                    <label className="flex-1">
                      <span className="text-[10px] text-muted-foreground">Referenced columns</span>
                      <input value={c.refCols} onChange={(e) => patch(c.id, { refCols: e.target.value })} placeholder="id" className="mt-0.5 h-7 w-full rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus:bg-primary/5" />
                    </label>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {dirty ? <p className="text-[11px] text-muted-foreground">{statements.length} statement{statements.length === 1 ? "" : "s"} pending — review or save.</p> : null}
      </div>
    </div>
  );
}
