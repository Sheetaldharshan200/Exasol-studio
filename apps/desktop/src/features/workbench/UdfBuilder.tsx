import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  buildUdfSql,
  COMMON_TYPES,
  DEFAULT_UDF_LANGS,
  DEFAULT_UDF_SPEC,
  type UdfKind,
  type UdfLang,
  type UdfLangOption,
  type UdfParam,
  type UdfSpec,
} from "@/features/workbench/udf-builder";
import { cn } from "@/lib/utils";

/**
 * A visual UDF builder rendered as a notebook-style block: pick language and
 * kind, name it, add typed parameters, set the return/emit type — and a live
 * `--/ … /` preview updates as you go. "Insert" drops the DDL into the editor
 * (optionally running it) instead of hunting for the autocomplete snippet.
 */
export function UdfBuilder({ onInsert, onRun, onClose, langs }: {
  onInsert: (sql: string) => void;
  onRun?: (sql: string) => void;
  onClose: () => void;
  /** Languages actually available on the connected DB (from SCRIPT_LANGUAGES);
   *  falls back to the standard set when not provided/known. */
  langs?: UdfLangOption[];
}) {
  const options = langs && langs.length ? langs : DEFAULT_UDF_LANGS;
  const [spec, setSpec] = useState<UdfSpec>(() => ({
    ...DEFAULT_UDF_SPEC,
    lang: (options.find((o) => o.id === DEFAULT_UDF_SPEC.lang)?.id ?? options[0].id) as UdfLang,
  }));
  const sql = useMemo(() => buildUdfSql(spec), [spec]);
  const set = <K extends keyof UdfSpec>(k: K, v: UdfSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const setParam = (i: number, patch: Partial<UdfParam>) =>
    setSpec((s) => ({ ...s, params: s.params.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  const label = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
  const field = "h-7 rounded-md border border-border bg-editor px-2 text-[12px] text-foreground outline-none focus:border-primary/60";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel/60">
      {/* Block header — notebook-cell style */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/30 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/15 font-mono text-[11px] font-bold text-primary">ƒ</span>
        <span className="text-[12.5px] font-semibold text-foreground">New UDF script</span>
        <span className="rounded bg-secondary px-1.5 py-px font-mono text-[9.5px] text-muted-foreground">{spec.lang} · {spec.kind}</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 p-3 lg:grid-cols-2">
        {/* Left: the form */}
        <div className="flex flex-col gap-3">
          <div>
            <div className={label}>Language</div>
            <div className="mt-1 flex gap-1">
              {options.map((l) => (
                <button
                  key={l.id}
                  onClick={() => set("lang", l.id as UdfLang)}
                  className={cn(
                    "h-7 flex-1 rounded-md border text-[11.5px] font-medium transition-colors",
                    spec.lang === l.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className={label}>Kind</div>
              <div className="mt-1 flex gap-1">
                {(["SCALAR", "SET"] as UdfKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => set("kind", k)}
                    title={k === "SCALAR" ? "One row in, one value out (RETURNS)" : "A group in, many rows out (EMITS)"}
                    className={cn(
                      "h-7 flex-1 rounded-md border text-[11.5px] font-medium transition-colors",
                      spec.kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {k === "SCALAR" ? "Scalar" : "Set"}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-end gap-1.5 pb-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={spec.orReplace} onChange={(e) => set("orReplace", e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
              OR REPLACE
            </label>
          </div>

          <div>
            <div className={label}>Name</div>
            <input value={spec.name} onChange={(e) => set("name", e.target.value)} placeholder="MY_UDF" className={cn(field, "mt-1 w-full font-mono")} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className={label}>Parameters</span>
              <button onClick={() => set("params", [...spec.params, { name: "", type: "DOUBLE" }])} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="mt-1 flex flex-col gap-1.5">
              {spec.params.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No parameters.</p>
              ) : (
                spec.params.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} placeholder="name" className={cn(field, "w-28 font-mono")} />
                    <input value={p.type} onChange={(e) => setParam(i, { type: e.target.value })} list="udf-types" placeholder="TYPE" className={cn(field, "min-w-0 flex-1 font-mono")} />
                    <button onClick={() => set("params", spec.params.filter((_, j) => j !== i))} aria-label="Remove parameter" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
              <datalist id="udf-types">{COMMON_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </div>

          <div>
            <div className={label}>{spec.kind === "SET" ? "Emits (columns)" : "Returns (type)"}</div>
            <input
              value={spec.returns}
              onChange={(e) => set("returns", e.target.value)}
              list={spec.kind === "SET" ? undefined : "udf-types"}
              placeholder={spec.kind === "SET" ? "result VARCHAR(200)" : "DOUBLE"}
              className={cn(field, "mt-1 w-full font-mono")}
            />
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex min-h-0 flex-col">
          <div className={label}>Preview</div>
          <pre className="mt-1 min-h-0 flex-1 overflow-auto rounded-md border border-border bg-editor p-2.5 font-mono text-[11px] leading-relaxed text-foreground [scrollbar-width:thin]">{sql}</pre>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <p className="mr-auto text-[10.5px] text-muted-foreground">
          Language UDFs need an installed script language container — <span className="font-mono">exasol slc install {spec.lang === "PYTHON3" ? "python3" : spec.lang.toLowerCase()}</span> (Lua needs none).
        </p>
        <button onClick={() => onInsert(sql)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
          Insert into editor
        </button>
        {onRun ? (
          <button onClick={() => onRun(sql)} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85">
            Create &amp; run
          </button>
        ) : null}
      </div>
    </div>
  );
}
