import { useMemo, useState } from "react";
import { Code2, Loader2, RotateCcw, Save, ShieldOff, X } from "lucide-react";

function qualify(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}

/**
 * Rename a table and set its comment, from the Details → Info tab. Same
 * two-button model as every other editor: Review SQL / Confirm & Save, with the
 * inline error banner on failure. Uses Exasol's RENAME TABLE and COMMENT ON.
 */
export function TableInfoEditor({
  schema,
  name,
  onOpenSql,
  onApply,
  onDone,
}: {
  schema?: string;
  name: string;
  onOpenSql?: (sql: string, title?: string) => void;
  onApply?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  onDone: () => void;
}) {
  const [newName, setNewName] = useState(name);
  const [comment, setComment] = useState("");
  const [applyError, setApplyError] = useState<{ message: string; sql?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const statements = useMemo<string[]>(() => {
    const out: string[] = [];
    const to = newName.trim();
    if (to && to !== name) out.push(`RENAME TABLE ${qualify(schema, name)} TO "${to}";`);
    if (comment.trim()) {
      // A rename runs first, so the comment targets the new name.
      const finalName = to && to !== name ? to : name;
      out.push(`COMMENT ON TABLE ${qualify(schema, finalName)} IS '${comment.replace(/'/g, "''")}';`);
    }
    return out;
  }, [newName, comment, name, schema]);

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
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Editing properties</span>
        <span className="font-mono text-[11px] text-muted-foreground">{qualify(schema, name)}</span>
        <button onClick={() => { setNewName(name); setComment(""); setApplyError(null); }} disabled={!dirty} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Revert</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { if (statements.length && onOpenSql) onOpenSql(statements.join("\n"), `Alter ${name}`); }} disabled={!dirty || saving || !onOpenSql} title="Open these changes as SQL in a new query tab" className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"><Code2 className="h-3.5 w-3.5" /> Review SQL</button>
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
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Table name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 w-full rounded-lg border border-border bg-transparent px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/50" />
          <span className="mt-0.5 block text-[10px] text-muted-foreground">Renames within schema {schema ?? "—"}.</span>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Comment</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Describe what this table holds…" className="w-full resize-y rounded-lg border border-border bg-transparent px-2.5 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50" />
        </label>
        {dirty ? <p className="text-[11px] text-muted-foreground">{statements.length} statement{statements.length === 1 ? "" : "s"} pending — review or save.</p> : null}
      </div>
    </div>
  );
}
