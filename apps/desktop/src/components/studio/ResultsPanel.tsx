/**
 * The bottom result area of a SQL tab. Extracted from ExasolStudio.tsx (a file
 * we are actively shrinking) so the results experience has one home.
 *
 * The old "Add to dashboard" / "Performance" buttons are now first-class views
 * selected by a horizontal tab strip: Results | Query Performance | Show in
 * Dashboard. Query Performance renders the engine plan inline (bound to this
 * tab's query) instead of spawning a separate tab.
 */
import { BarChart3, ChevronLeft, ChevronRight, Gauge, Loader2, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitStatements } from "@/lib/sql-text";
import { ResultsGrid, RunStatusStrip } from "./HistoryDock";
import { QueryProfileView, type ProfileData } from "@/features/workbench/QueryProfileView";
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
  profileData,
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
  runMeta?: { startedAt: number; finishedAt?: number; scope: string; ok?: boolean };
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
  profileData?: ProfileData;
  profiling: boolean;
  onProfile: () => void;
  onSendToDashboard: () => void;
}) {
  const busy = Boolean(runMeta && !runMeta.finishedAt);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 border-y border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onViewChange(t.id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition",
              view === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
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
      <div className={cn("relative min-h-0 flex-1 overflow-auto", busy && "pointer-events-none opacity-60")}>
        {view === "performance" ? (
          profileData ? (
            <QueryProfileView data={profileData} onOpenSql={onOpenSql} />
          ) : (
            <PanelEmpty
              icon={Gauge}
              title="Query Performance"
              body="Profile this query to see the engine's step-by-step execution plan — the parts it ran, rows in and out, and where the time went."
              action={{ label: profiling ? "Profiling…" : "Profile this query", onClick: onProfile, busy: profiling }}
            />
          )
        ) : view === "dashboard" ? (
          <PanelEmpty
            icon={BarChart3}
            title="Show in Dashboard"
            body="Add this query as a panel and open it on its schema's dashboard, where you can chart it and pin it alongside related metrics."
            action={{ label: "Open in dashboard", onClick: onSendToDashboard }}
          />
        ) : mergeResults && (response?.results.length ?? 0) > 1 ? (
          // Merged view — every result set from the last execution.
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
