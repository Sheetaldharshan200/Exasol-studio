import { useMemo, useState } from "react";
import { Code2, KeyRound, Loader2, Plus, RotateCcw, Save, ShieldOff, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColumnInfo, ConstraintInfo } from "@/lib/ipc";

/** Shared, fixed column widths for the columns table. The read-only Columns
 *  view and this editor both render this colgroup, so toggling "Edit structure"
 *  swaps text for inputs in place — the columns never shift under the cursor. */
export function ColumnsColgroup() {
  return (
    <colgroup>
      <col style={{ width: 44 }} />
      <col style={{ width: "32%" }} />
      <col style={{ width: "44%" }} />
      <col style={{ width: 128 }} />
      <col style={{ width: 44 }} />
    </colgroup>
  );
}

/** Common Exasol column types offered in the type dropdown. The column's own
 *  current type is always added to the list so it stays selectable. */
const COMMON_TYPES = [
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMP WITH LOCAL TIME ZONE",
  "DECIMAL(18,0)",
  "DECIMAL(18,2)",
  "DECIMAL(36,18)",
  "DOUBLE PRECISION",
  "VARCHAR(200)",
  "VARCHAR(2000)",
  "VARCHAR(2000000)",
  "CHAR(1)",
  "HASHTYPE",
  "GEOMETRY",
];

const CUSTOM = "__custom__";

/** A working copy of one column. `origName` is null for freshly added rows. */
type Draft = {
  id: string;
  origName: string | null;
  origType: string;
  origNotNull: boolean;
  name: string;
  type: string;
  notNull: boolean;
  dropped: boolean;
  /** True while the type is being typed freehand (dropdown set to Custom…). */
  custom: boolean;
};

function qualify(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}

/**
 * In-place table-structure editor for the Details → Columns tab. Edits are
 * staged in a local draft, then diffed against the original to build
 * ALTER TABLE statements. Two exits, same as the data grid: "Review SQL"
 * opens the statements in a query tab, "Confirm & Save" runs them directly
 * and surfaces the first DB error inline (edits kept on failure).
 */
export function TableStructureEditor({
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
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  onOpenSql?: (sql: string, title?: string) => void;
  onApply?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  onDone: () => void;
}) {
  const t = qualify(schema, table);
  const currentPk = useMemo<ConstraintInfo | undefined>(
    () => constraints.find((c) => c.constraintType === "PRIMARY KEY"),
    [constraints],
  );
  const origPkNames = useMemo(
    () => new Set((currentPk?.columns ?? []).map((c) => c.column)),
    [currentPk],
  );

  const [rows, setRows] = useState<Draft[]>(() =>
    columns.map((c, i) => ({
      id: `c${i}`,
      origName: c.name,
      origType: c.dataType,
      origNotNull: c.nullable === false,
      name: c.name,
      type: c.dataType,
      notNull: c.nullable === false,
      dropped: false,
      custom: !COMMON_TYPES.includes(c.dataType),
    })),
  );
  // PK membership by draft id (columns pinned as primary key).
  const [pk, setPk] = useState<Set<string>>(
    () => new Set(columns.map((c, i) => (origPkNames.has(c.name) ? `c${i}` : "")).filter(Boolean)),
  );
  const [seq, setSeq] = useState(columns.length);
  const [applyError, setApplyError] = useState<{ message: string; sql?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(id: string, p: Partial<Draft>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function addRow() {
    const id = `n${seq}`;
    setSeq((s) => s + 1);
    setRows((rs) => [...rs, { id, origName: null, origType: "", origNotNull: false, name: "", type: "VARCHAR(200)", notNull: false, dropped: false, custom: false }]);
  }
  function togglePk(id: string) {
    setPk((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function reset() {
    setRows(
      columns.map((c, i) => ({
        id: `c${i}`, origName: c.name, origType: c.dataType, origNotNull: c.nullable === false,
        name: c.name, type: c.dataType, notNull: c.nullable === false, dropped: false,
        custom: !COMMON_TYPES.includes(c.dataType),
      })),
    );
    setPk(new Set(columns.map((c, i) => (origPkNames.has(c.name) ? `c${i}` : "")).filter(Boolean)));
    setApplyError(null);
  }

  // Diff the draft against the original to produce ordered ALTER statements.
  const statements = useMemo<string[]>(() => {
    const out: string[] = [];
    const live = rows.filter((r) => !(r.origName === null && r.dropped)); // discard added-then-dropped
    // ADD new columns
    for (const r of live) {
      if (r.origName === null && r.name.trim() && r.type.trim()) {
        out.push(`ALTER TABLE ${t} ADD COLUMN "${r.name.trim()}" ${r.type.trim()}${r.notNull ? " NOT NULL" : ""};`);
      }
    }
    // MODIFY type / nullability on existing (kept) columns — keyed on the ORIGINAL name (rename runs after)
    for (const r of live) {
      if (r.origName !== null && !r.dropped) {
        const typeChanged = r.type.trim() && r.type.trim() !== r.origType;
        const nullChanged = r.notNull !== r.origNotNull;
        if (typeChanged || nullChanged) {
          out.push(`ALTER TABLE ${t} MODIFY COLUMN "${r.origName}" ${(r.type.trim() || r.origType)}${r.notNull ? " NOT NULL" : ""};`);
        }
      }
    }
    // RENAME existing columns
    for (const r of live) {
      if (r.origName !== null && !r.dropped && r.name.trim() && r.name.trim() !== r.origName) {
        out.push(`ALTER TABLE ${t} RENAME COLUMN "${r.origName}" TO "${r.name.trim()}";`);
      }
    }
    // DROP existing columns
    for (const r of live) {
      if (r.origName !== null && r.dropped) {
        out.push(`ALTER TABLE ${t} DROP COLUMN "${r.origName}";`);
      }
    }
    // PRIMARY KEY — replace only if the pinned set (final names) differs from the original
    const finalPk = live.filter((r) => !r.dropped && pk.has(r.id)).map((r) => r.name.trim()).filter(Boolean);
    const origList = (currentPk?.columns ?? []).map((c) => c.column);
    const changed = finalPk.length !== origList.length || finalPk.some((n, i) => n !== origList[i]);
    if (changed) {
      if (currentPk) out.push(`ALTER TABLE ${t} DROP CONSTRAINT "${currentPk.name}";`);
      if (finalPk.length) out.push(`ALTER TABLE ${t} ADD CONSTRAINT "PK_${table}" PRIMARY KEY (${finalPk.map((n) => `"${n}"`).join(", ")});`);
    }
    return out;
  }, [rows, pk, t, table, currentPk]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Editing structure</span>
        <span className="font-mono text-[11px] text-muted-foreground">{t}</span>
        <button onClick={addRow} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> Add column
        </button>
        <button onClick={reset} disabled={!dirty} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" /> Revert
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => { if (statements.length && onOpenSql) onOpenSql(statements.join("\n"), `Alter ${table}`); }}
            disabled={!dirty || saving || !onOpenSql}
            title="Open these changes as SQL in a new query tab"
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Code2 className="h-3.5 w-3.5" /> Review SQL
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving || !onApply}
            title="Run these changes now"
            className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Confirm &amp; Save
          </button>
          <button onClick={onDone} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Done
          </button>
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

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-[12px]">
          <ColumnsColgroup />
          <thead className="sticky top-0 z-10">
            <tr className="bg-secondary text-left">
              <th className="border border-border px-2 py-1.5 font-medium" title="Primary key"><KeyRound className="h-3.5 w-3.5 text-muted-foreground" /></th>
              <th className="border border-border px-3 py-1.5 font-medium">Column</th>
              <th className="border border-border px-3 py-1.5 font-medium">Type</th>
              <th className="border border-border px-3 py-1.5 font-medium">Nullable</th>
              <th className="border border-border px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pinned = pk.has(r.id);
              const typeOpts = r.custom || COMMON_TYPES.includes(r.type) ? COMMON_TYPES : [r.type, ...COMMON_TYPES];
              return (
                <tr key={r.id} className={cn("even:bg-secondary/20", r.dropped && "opacity-45")}>
                  <td className="border border-border px-2 py-1 text-center">
                    <button
                      onClick={() => togglePk(r.id)}
                      disabled={r.dropped}
                      title={pinned ? "Remove from primary key" : "Add to primary key"}
                      className={cn("flex h-5 w-5 items-center justify-center rounded", pinned ? "bg-primary/15 text-primary" : "text-muted-foreground/50 hover:text-foreground")}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="border border-border px-2 py-0.5">
                    <input
                      value={r.name}
                      disabled={r.dropped}
                      onChange={(e) => patch(r.id, { name: e.target.value })}
                      placeholder="column_name"
                      className={cn("w-full bg-transparent px-1 py-0.5 font-mono text-[12px] text-foreground outline-none focus:bg-primary/5", r.dropped && "line-through")}
                    />
                  </td>
                  <td className="border border-border px-2 py-0.5 align-top">
                    <Select
                      value={r.custom ? CUSTOM : r.type}
                      disabled={r.dropped}
                      onValueChange={(v) => {
                        if (v === CUSTOM) patch(r.id, { custom: true });
                        else patch(r.id, { type: v, custom: false });
                      }}
                    >
                      <SelectTrigger size="sm" className="h-7 w-full font-mono text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {typeOpts.map((tp) => <SelectItem key={tp} value={tp} className="font-mono text-[11px]">{tp}</SelectItem>)}
                        <SelectItem value={CUSTOM}>Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                    {r.custom ? (
                      <input
                        value={r.type}
                        disabled={r.dropped}
                        onChange={(e) => patch(r.id, { type: e.target.value })}
                        placeholder="e.g. DECIMAL(10,3)"
                        className="mt-1 w-full rounded border border-border bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:bg-primary/5"
                      />
                    ) : null}
                  </td>
                  <td className="border border-border px-3 py-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={r.notNull} disabled={r.dropped} onChange={(e) => patch(r.id, { notNull: e.target.checked })} className="accent-[var(--primary)]" />
                      NOT NULL
                    </label>
                  </td>
                  <td className="border border-border px-2 py-1 text-center">
                    {r.origName === null ? (
                      <button onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} title="Remove this new column" className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    ) : r.dropped ? (
                      <button onClick={() => patch(r.id, { dropped: false })} title="Keep this column" className="text-muted-foreground hover:text-foreground"><Undo2 className="h-3.5 w-3.5" /></button>
                    ) : (
                      <button onClick={() => patch(r.id, { dropped: true })} title="Drop this column" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {dirty ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">{statements.length} statement{statements.length === 1 ? "" : "s"} pending — review or save.</p>
        ) : null}
      </div>
    </div>
  );
}
