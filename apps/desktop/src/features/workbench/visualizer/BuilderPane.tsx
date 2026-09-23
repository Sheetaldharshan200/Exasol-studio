import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Filter, Loader2, Play, SquarePen, X } from "lucide-react";
import { QueryBuilder, type Classnames, type Field, type RuleGroupType, type Translations } from "react-querybuilder";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage, ipc, type GraphLink } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { linkKey, previewSql, type Aggregate, type JoinType } from "../build-sql";
import { formatElapsed } from "@/lib/elapsed";
import { useElapsedMs } from "@/lib/use-elapsed-ms";

const AGGREGATES: Aggregate[] = ["COUNT", "SUM", "AVG", "MIN", "MAX"];

export type BuilderPaneProps = {
  profileId: string;
  connectionName: string;
  picked: Set<string>;
  onUnpick: (key: string) => void;
  onClear: () => void;
  aggregates: Record<string, Aggregate>;
  onAggregates: (next: Record<string, Aggregate>) => void;
  /** Links between the picked tables — each gets a join type. */
  joinLinks: GraphLink[];
  joinTypes: Record<string, JoinType>;
  onJoinTypes: (next: Record<string, JoinType>) => void;
  fields: Field[];
  pickedFields: Field[];
  where: RuleGroupType;
  onWhere: (q: RuleGroupType) => void;
  orderKey: string | null;
  onOrderKey: (k: string | null) => void;
  orderDir: "ASC" | "DESC";
  onOrderDir: (d: "ASC" | "DESC") => void;
  limit: number;
  onLimit: (n: number) => void;
  /** The SQL as of this render — what Copy / Run / Preview act on. */
  sql: string;
  /** The SQL a beat behind the keystrokes — what the pane displays. */
  displaySql: string;
  onOpenSql?: (sql: string, run: boolean) => void;
  rqbClassnames: Partial<Classnames>;
  rqbTranslations: Partial<Translations>;
};

type Preview = { columns: string[]; rows: unknown[][]; ms: number } | { error: string } | null;

/**
 * The Build pane under the diagram: picked columns (with an aggregate each),
 * joins between picked tables (INNER/LEFT), the WHERE builder, the SQL, and
 * a 100-row preview run right here. Pure decisions live in build-sql.ts.
 */
export function BuilderPane(p: BuilderPaneProps) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const previewElapsed = useElapsedMs(previewStartedAt, previewing);
  // The SQL each preview was launched for — a late answer for an older query
  // is dropped, and a new SQL invalidates the rows on screen.
  const previewFor = useRef<string | null>(null);
  useEffect(() => {
    setPreview(null);
    previewFor.current = null;
  }, [p.sql]);

  const runPreview = async () => {
    const launched = p.sql;
    previewFor.current = launched;
    setPreviewing(true);
    setPreviewStartedAt(Date.now());
    const started = performance.now();
    try {
      // The builder's SQL is one statement with LIMIT 100 forced on top; never split.
      const sql = previewSql(launched);
      const resp = await ipc.executeSql(p.profileId, p.connectionName, sql, 100, false, false);
      if (previewFor.current !== launched) return;
      const first = resp.results[0];
      if (!resp.success || first?.error) throw new Error(first?.error ?? "The preview failed.");
      setPreview({ columns: (first?.columns ?? []).map((c) => c.name), rows: first?.rows ?? [], ms: Math.round(performance.now() - started) });
    } catch (e) {
      if (previewFor.current === launched) setPreview({ error: errorMessage(e) });
    } finally {
      if (previewFor.current === launched) setPreviewing(false);
    }
  };
  const disabled = p.picked.size === 0;

  return (
    <div className="flex h-[340px] shrink-0 flex-col border-t border-border bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <SquarePen className="h-3.5 w-3.5 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Query builder</span>
        <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {p.picked.size} col{p.picked.size === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Order by</span>
          <Select value={p.orderKey ?? "__none__"} onValueChange={(v) => p.onOrderKey(v === "__none__" ? null : v)}>
            <SelectTrigger className="h-6 min-w-[120px] text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">none</SelectItem>
              {p.pickedFields.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {p.aggregates[f.name] ? `${p.aggregates[f.name]}(${f.label})` : f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={p.orderDir} onValueChange={(v) => p.onOrderDir(v as "ASC" | "DESC")}>
            <SelectTrigger className="h-6 w-[70px] text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ASC">ASC</SelectItem>
              <SelectItem value="DESC">DESC</SelectItem>
            </SelectContent>
          </Select>
          <span>Limit</span>
          <NumberInput value={p.limit} min={0} onCommit={p.onLimit} className="h-6 w-16 border-input bg-transparent text-xs" />
        </div>
      </div>

      {/* Selected columns — each chip carries its aggregate. */}
      <div className="flex min-h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Select</span>
        {disabled ? (
          <span className="text-[11px] text-muted-foreground/70">Tick columns on the tables above…</span>
        ) : (
          <>
            {[...p.picked].map((k) => {
              const agg = p.aggregates[k];
              return (
                <span key={k} className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pr-1 pl-1 font-mono text-[10.5px] text-foreground">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Aggregate"
                        className={cn("flex h-4 items-center gap-0.5 rounded-full px-1.5 text-[9.5px] font-semibold uppercase", agg ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
                      >
                        {agg ?? "fx"} <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[110px]">
                      <DropdownMenuItem onClick={() => p.onAggregates(Object.fromEntries(Object.entries(p.aggregates).filter(([key]) => key !== k)))} className="font-mono text-[11px]">
                        plain column{!agg ? <Check className="ml-auto h-3 w-3" /> : null}
                      </DropdownMenuItem>
                      {AGGREGATES.map((a) => (
                        <DropdownMenuItem key={a} onClick={() => p.onAggregates({ ...p.aggregates, [k]: a })} className="font-mono text-[11px]">
                          {a}{agg === a ? <Check className="ml-auto h-3 w-3" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {k}
                  <button onClick={() => p.onUnpick(k)} aria-label={`Remove ${k}`} className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
            <button onClick={p.onClear} className="ml-1 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </>
        )}
      </div>

      {/* Joins between the picked tables — INNER by default, LEFT on request. */}
      {p.joinLinks.length > 0 ? (
        <div className="flex min-h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Joins</span>
          {p.joinLinks.map((l) => {
            const key = linkKey(l);
            const left = p.joinTypes[key] === "LEFT";
            return (
              <button
                key={key}
                onClick={() => p.onJoinTypes({ ...p.joinTypes, [key]: left ? "INNER" : "LEFT" })}
                title={left ? "LEFT JOIN — keep every row of the left table. Click for INNER." : "INNER JOIN — matching rows only. Click for LEFT."}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-foreground hover:border-primary/50"
              >
                <span className={cn("rounded px-1 text-[9px] font-semibold", left ? "bg-warning/20 text-warning" : "bg-primary/15 text-primary")}>{left ? "LEFT" : "INNER"}</span>
                {l.source}.{l.sourceColumn} = {l.target}.{l.targetColumn}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
            <Filter className="h-3 w-3" /> Filters (WHERE)
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2.5">
            <QueryBuilder fields={p.fields} query={p.where} onQueryChange={p.onWhere} controlClassnames={p.rqbClassnames} translations={p.rqbTranslations} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col bg-editor">
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 text-[11px] text-muted-foreground">
            SQL
            <button
              onClick={() => {
                navigator.clipboard?.writeText(p.sql);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              disabled={disabled}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/90">{p.displaySql}</pre>
            {preview && "error" in preview ? (
              <pre className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] whitespace-pre-wrap text-destructive">{preview.error}</pre>
            ) : preview ? (
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <div className="border-b border-border px-2 py-1 text-[10.5px] text-muted-foreground">
                  Preview · {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} · {preview.ms} ms
                </div>
                <table className="text-[11px]">
                  <thead>
                    <tr>{preview.columns.map((c) => <th key={c} className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>)}</tr>
                  </thead>
                  <tbody className="font-mono">
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="even:bg-secondary/30">{r.map((v, j) => <td key={j} className="max-w-[240px] truncate px-2 py-0.5 text-foreground/90">{v === null || v === undefined ? "∅" : String(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <div className="flex h-11 shrink-0 items-center justify-end gap-2 border-t border-border px-3">
            <button
              onClick={() => void runPreview()}
              disabled={disabled || previewing}
              data-agent-id="builder.preview"
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {previewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running · {formatElapsed(previewElapsed)}
                </>
              ) : (
                "Preview 100 rows"
              )}
            </button>
            <button onClick={() => p.onOpenSql?.(p.sql, false)} disabled={disabled} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40">
              Open in editor
            </button>
            <button onClick={() => p.onOpenSql?.(p.sql, true)} disabled={disabled} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40">
              <Play className="h-3.5 w-3.5 fill-current" /> Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
