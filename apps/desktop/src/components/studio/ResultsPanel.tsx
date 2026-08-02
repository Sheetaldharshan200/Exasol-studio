/**
 * The bottom result area of a SQL tab. Extracted from ExasolStudio.tsx (a file
 * we are actively shrinking) so the results experience has one home.
 *
 * The old "Add to dashboard" / "Performance" buttons are now first-class views
 * selected by a horizontal tab strip: Results | Query Performance | Show in
 * Dashboard. Query Performance renders the engine plan inline (bound to this
 * tab's query) instead of spawning a separate tab.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Download, Gauge, Loader2, PanelRightClose, PanelRightOpen, Search, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitStatements } from "@/lib/sql-text";
import { cellText, computeStats, filterRows, resultTabLabel, statementVerb, toCsv } from "@/lib/result-stats";
import { ResultsGrid, RunStatusStrip } from "./HistoryDock";
import { QueryPlanTabs } from "./QueryPlanTabs";
import type { Plan } from "@/lib/plan-model";
import type { ExecuteResponse, StatementResult } from "@/lib/ipc";
import type { ResultView } from "./tabs";

const TABS: { id: ResultView; label: string; icon: typeof Table2 }[] = [
  { id: "results", label: "Results", icon: Table2 },
  { id: "performance", label: "Query Performance", icon: Gauge },
  { id: "dashboard", label: "Show in Dashboard", icon: BarChart3 },
];

export function ResultsPanel({
  view,
  onViewChange,
  sql,
  response,
  lastResult,
  execError,
  runMeta,
  queryProgress,
  resultPage,
  maxRows,
  mergeResults,
  editable,
  fontSize,
  zebra,
  paging,
  onPage,
  onOpenSql,
  onCommitEdits,
  editBusy,
  planData,
  profileNote,
  profiling,
  onProfile,
  onSendToDashboard,
}: {
  view: ResultView;
  onViewChange: (v: ResultView) => void;
  sql: string;
  response: ExecuteResponse | null;
  lastResult: StatementResult | null;
  execError: string | null;
  runMeta?: { startedAt: number; finishedAt?: number; scope: string; ok?: boolean; sql?: string };
  queryProgress?: {
    statement?: number;
    total?: number;
    activity?: string | null;
    percent?: number | null;
    elapsedMs: number;
    finished: boolean;
  };
  resultPage?: number;
  maxRows: number;
  mergeResults: boolean;
  editable?: { schema?: string; table: string; pk: string[]; columns: string[] } | null;
  fontSize: number;
  zebra: boolean;
  paging: boolean;
  onPage: (page: number) => void;
  onOpenSql: (sql: string, title?: string) => void;
  onCommitEdits: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  editBusy: boolean;
  planData?: Plan[] | Plan;
  profileNote?: string;
  profiling: boolean;
  onProfile: () => void;
  onSendToDashboard: () => void;
}) {
  const busy = Boolean(runMeta && !runMeta.finishedAt);
  // Runs before this release persisted a single Plan object — normalize.
  const plans: Plan[] = Array.isArray(planData) ? planData : planData ? [planData] : [];

  // Auto-profile: opening the Query Performance tab shows the plan straight away
  // — no button. Fire once per result (guarded by autoProfiledFor so a failed
  // profile doesn't loop), and only for a SELECT that already produced rows so
  // we never silently re-run a write.
  const autoProfiledFor = useRef<StatementResult | null>(null);
  useEffect(() => {
    if (view === "performance" && plans.length === 0 && !profiling && lastResult?.kind === "resultSet") {
      if (autoProfiledFor.current !== lastResult) {
        autoProfiledFor.current = lastResult;
        onProfile();
      }
    }
  }, [view, planData, profiling, lastResult, onProfile]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 border-y border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onViewChange(t.id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition",
              view === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
        {view === "results" && lastResult ? (
          <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            {lastResult.kind === "resultSet"
              ? (() => {
                  const page = resultPage ?? 0;
                  const single = splitStatements(sql).length === 1 && /^select/i.test(sql.trim());
                  const from = page * maxRows + (lastResult.rowCount ? 1 : 0);
                  const to = page * maxRows + lastResult.rowCount;
                  const hasNext = lastResult.truncated;
                  if (!single || (page === 0 && !hasNext)) {
                    return <>{lastResult.rowCount} rows{lastResult.truncated ? " (truncated)" : ""}</>;
                  }
                  return (
                    <span
                      className="flex items-center gap-1"
                      title="Pages beyond the first are ordered by the first column — Exasol requires a deterministic order for OFFSET"
                    >
                      Rows {from.toLocaleString()}–{to.toLocaleString()}
                      <button
                        onClick={() => onPage(page - 1)}
                        disabled={page === 0 || paging}
                        aria-label="Previous page"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary hover:text-foreground disabled:opacity-35"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onPage(page + 1)}
                        disabled={!hasNext || paging}
                        aria-label="Next page"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary hover:text-foreground disabled:opacity-35"
                      >
                        {paging ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  );
                })()
              : null}
            · {response?.totalElapsedMs ?? 0} ms
          </span>
        ) : null}
      </div>
      <RunStatusStrip meta={runMeta} response={response} />
      {/* Live progress while a batch runs (issues #19/#20): the previous result
          stays pinned underneath; a processing overlay + engine progress bar
          sit on top until 100%. */}
      {busy
        ? (() => {
            const pct = queryProgress?.percent ?? null;
            return (
              <div className="shrink-0 border-b border-border bg-panel/60 px-3 py-2">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="font-medium text-foreground">Processing…</span>
                  {queryProgress?.total && queryProgress.total > 1 ? (
                    <span className="font-mono text-[11px]">
                      statement {queryProgress.statement}/{queryProgress.total}
                    </span>
                  ) : null}
                  {queryProgress?.activity ? (
                    <span className="min-w-0 truncate font-mono text-[11px]">{queryProgress.activity}</span>
                  ) : null}
                  <span className="ml-auto font-mono text-[11px]">
                    {pct !== null
                      ? `${pct}%`
                      : `${((queryProgress?.elapsedMs ?? Date.now() - (runMeta?.startedAt ?? 0)) / 1000).toFixed(1)}s`}
                  </span>
                </div>
                <div className="relative mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  {pct !== null ? (
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  ) : (
                    <div className="exa-indeterminate" />
                  )}
                </div>
              </div>
            );
          })()
        : null}
      <div className={cn("relative min-h-0 flex-1 overflow-auto", busy && "pointer-events-none")}>
        {busy ? (
          // A run is in flight — show ITS progress + the exact SQL running, not
          // the previous result.
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-[12.5px]">Running your query…</span>
            </div>
            {runMeta?.sql ? (
              <pre className="max-h-40 w-full max-w-2xl overflow-auto rounded-md border border-border bg-editor px-3 py-2 text-left font-mono text-[11.5px] whitespace-pre-wrap break-words text-foreground [scrollbar-width:thin]">
                {runMeta.sql.trim()}
              </pre>
            ) : null}
          </div>
        ) : view === "performance" ? (
          plans.length > 0 ? (
            <QueryPlanTabs plans={plans} onOpenSql={onOpenSql} />
          ) : profiling ? (
            // A profile fetch is actually in flight — only then spin.
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-[12.5px]">Profiling this query…</p>
            </div>
          ) : lastResult ? (
            // Ran but no plan (yet): auto-profile failed or produced nothing —
            // never a stuck spinner; explain and offer a manual retry.
            <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center text-muted-foreground">
              <Gauge className="h-6 w-6 opacity-40" />
              <p className="text-[12.5px]">No execution plan yet for this run.</p>
              {profileNote ? (
                <p className="max-w-xl rounded-md border border-border bg-editor px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {profileNote}
                </p>
              ) : null}
              <button
                onClick={onProfile}
                className="h-7 rounded-md border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Profile query
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
              <Gauge className="h-6 w-6 opacity-40" />
              <p className="text-[12.5px]">Run a query to see its execution plan.</p>
            </div>
          )
        ) : view === "dashboard" ? (
          <PanelEmpty
            icon={BarChart3}
            title="Show in Dashboard"
            body="Add this query as a panel and open it on its schema's dashboard, where you can chart it and pin it alongside related metrics."
            action={{ label: "Open in dashboard", onClick: onSendToDashboard }}
          />
        ) : (response?.results.length ?? 0) > 1 ? (
          mergeResults ? (
            // Merged view — every result set stacked (toggle in the toolbar).
            <div className="flex flex-col">
              {response!.results.map((r, i) => (
                <div key={i} className="border-b border-border">
                  <div className="bg-secondary/50 px-3 py-1 font-mono text-[10px] text-muted-foreground">
                    #{i + 1} · {r.rowCount} rows{r.truncated ? " (truncated)" : ""} · {r.elapsedMs} ms
                  </div>
                  <div className="h-[280px]">
                    <ResultsGrid result={r} error={r.error} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // One tab per statement's result (DBVisualizer-style).
            <MultiResultView
              results={response!.results}
              sql={sql}
              ranAt={runMeta?.finishedAt}
              onOpenSql={onOpenSql}
              onCommitEdits={onCommitEdits}
              editBusy={editBusy}
              fontSize={fontSize}
              zebra={zebra}
            />
          )
        ) : lastResult && lastResult.kind === "resultSet" && !lastResult.error ? (
          <ResultsView
            result={lastResult}
            sql={sql}
            ranAt={runMeta?.finishedAt}
            editable={editable}
            onOpenSql={onOpenSql}
            onCommitEdits={onCommitEdits}
            editBusy={editBusy}
            fontSize={fontSize}
            zebra={zebra}
          />
        ) : (
          // No columns to filter/inspect (empty run, row-count-only, or error):
          // the plain grid renders the right empty/error/affected-rows state.
          <ResultsGrid
            result={lastResult}
            error={lastResult?.error ?? execError}
            editable={editable}
            onOpenSql={onOpenSql}
            onCommitEdits={onCommitEdits}
            editBusy={editBusy}
            fontSize={fontSize}
            zebra={zebra}
          />
        )}
      </div>
    </div>
  );
}

/**
/**
 * Multi-statement run: one tab per statement's result (DBVisualizer-style).
 * Defaults to the last result; each tab shows its rows (or the row-count /
 * error state). The selected index resets when a new run replaces the results.
 */
function MultiResultView({
  results,
  sql,
  ranAt,
  onOpenSql,
  onCommitEdits,
  editBusy,
  fontSize,
  zebra,
}: {
  results: StatementResult[];
  sql: string;
  ranAt?: number;
  onOpenSql: (sql: string, title?: string) => void;
  onCommitEdits: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  editBusy: boolean;
  fontSize: number;
  zebra: boolean;
}) {
  const [idx, setIdx] = useState(results.length - 1);
  const [goTo, setGoTo] = useState("");
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setIdx(results.length - 1);
    setGoTo("");
  }, [results]);
  // Keep the selected tab visible — the default (last result) starts off the
  // right edge of a long script's strip.
  useEffect(() => {
    stripRef.current
      ?.querySelector(`[data-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [idx]);
  // Each tab is labeled with its statement's verb (SELECT/INSERT/…) so a
  // script's tabs say what ran.
  const verbs = useMemo(() => splitStatements(sql).map((s) => statementVerb(s.text)), [sql]);
  function jumpTo(raw: string) {
    setGoTo(raw.replace(/\D/g, ""));
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= results.length) setIdx(n - 1);
  }
  const sel = results[Math.min(idx, results.length - 1)];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={stripRef} className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <input
          value={goTo}
          onChange={(e) => jumpTo(e.target.value)}
          placeholder="#"
          inputMode="numeric"
          aria-label={`Go to result 1–${results.length}`}
          title={`Go to result 1–${results.length}`}
          className="h-5 w-10 shrink-0 rounded border border-border bg-editor px-1 text-center font-mono text-[10.5px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        {results.map((r, i) => (
          <button
            key={i}
            data-idx={i}
            onClick={() => setIdx(i)}
            className={cn(
              "flex h-5 shrink-0 items-center gap-1 rounded px-2 text-[11px] transition",
              i === idx ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              r.error && i !== idx && "text-destructive",
            )}
          >
            {r.error ? <AlertTriangle className="h-3 w-3 text-destructive" /> : null}
            {resultTabLabel(r, i, verbs[i])}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {sel.kind === "resultSet" && !sel.error ? (
          <ResultsView
            result={sel}
            sql={sql}
            ranAt={ranAt}
            editable={null}
            onOpenSql={onOpenSql}
            onCommitEdits={onCommitEdits}
            editBusy={editBusy}
            fontSize={fontSize}
            zebra={zebra}
          />
        ) : (
          <ResultsGrid result={sel} error={sel.error} fontSize={fontSize} zebra={zebra} />
        )}
      </div>
    </div>
  );
}

/**
 * The Results view: a filter box, CSV export, the grid, and a right-hand
 * inspector (clicked cell value / query statistics / the SQL). Filter and
 * selection are local and reset whenever the underlying result changes.
 */
function ResultsView({
  result,
  sql,
  ranAt,
  editable,
  onOpenSql,
  onCommitEdits,
  editBusy,
  fontSize,
  zebra,
}: {
  result: StatementResult;
  sql: string;
  ranAt?: number;
  editable?: { schema?: string; table: string; pk: string[]; columns: string[] } | null;
  onOpenSql: (sql: string, title?: string) => void;
  onCommitEdits: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  editBusy: boolean;
  fontSize: number;
  zebra: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<{ value: unknown; column: string; row: number; col: number } | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  // A new result (re-run, page change, different tab) invalidates the filter
  // and any inspected cell — their indices no longer mean anything.
  useEffect(() => {
    setFilter("");
    setSelected(null);
  }, [result]);

  const displayRows = filter.trim() ? filterRows(result.rows, filter) : result.rows;
  const stats = computeStats({ timeMs: result.elapsedMs, rows: displayRows.length, cols: result.columns.length });

  function exportCsv() {
    const csv = toCsv(result.columns, displayRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
          <div className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                // Display-row indices shift when the filter changes, so a stale
                // highlight would point at the wrong row — drop it.
                setSelected(null);
              }}
              placeholder="Filter results…"
              className="h-6 w-full min-w-0 max-w-72 rounded-md border border-border bg-background pl-7 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {filter.trim() ? `${displayRows.length.toLocaleString()} of ${result.rowCount.toLocaleString()}` : `${result.rowCount.toLocaleString()} row${result.rowCount === 1 ? "" : "s"}`}
          </span>
          <button
            onClick={exportCsv}
            title="Export the shown rows as CSV"
            className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            onClick={() => setShowPanel((s) => !s)}
            title={showPanel ? "Hide details panel" : "Show details panel"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {showPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ResultsGrid
            result={result}
            error={null}
            filterQuery={filter}
            onCellClick={(info) => {
              setSelected(info);
              setShowPanel(true);
            }}
            selected={selected ? { row: selected.row, col: selected.col } : null}
            editable={editable}
            onOpenSql={onOpenSql}
            onCommitEdits={onCommitEdits}
            editBusy={editBusy}
            fontSize={fontSize}
            zebra={zebra}
            hideToolbar
          />
        </div>
      </div>
      {showPanel ? (
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-panel/40 p-3 [scrollbar-width:thin]">
          <InspectorSection title="Cell Value">
            {selected ? (
              <>
                <p className="mb-1 font-mono text-[10px] text-muted-foreground">{selected.column}</p>
                <pre className="max-h-40 overflow-auto rounded bg-secondary/50 p-2 font-mono text-[11.5px] whitespace-pre-wrap break-words text-foreground">
                  {selected.value === null ? "null" : cellText(selected.value)}
                </pre>
              </>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">Click a cell to inspect its full value.</p>
            )}
          </InspectorSection>
          <InspectorSection title="Query Statistics">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11.5px]">
              <Stat label="Time" value={`${stats.timeMs} ms`} />
              <Stat label="Rows" value={stats.rows.toLocaleString()} />
              <Stat label="Cols" value={String(stats.cols)} />
              <Stat label="Throughput" value={`${Math.round(stats.throughputPerSec).toLocaleString()} row/s`} />
              <Stat label="Avg/Row" value={`${stats.avgPerRowMs.toFixed(1)} ms`} />
            </dl>
          </InspectorSection>
          <InspectorSection title="Query">
            <pre className="max-h-40 overflow-auto rounded bg-secondary/50 p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-foreground">{sql.trim()}</pre>
            {ranAt ? <p className="mt-1 text-[10px] text-muted-foreground">Ran {new Date(ranAt).toLocaleString()}</p> : null}
          </InspectorSection>
        </aside>
      ) : null}
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{title}</p>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </>
  );
}

function PanelEmpty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Table2;
  title: string;
  body: string;
  action: { label: string; onClick: () => void; busy?: boolean };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/50" />
      <div className="max-w-md">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <button
        onClick={action.onClick}
        disabled={action.busy}
        className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
      >
        {action.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {action.label}
      </button>
    </div>
  );
}
