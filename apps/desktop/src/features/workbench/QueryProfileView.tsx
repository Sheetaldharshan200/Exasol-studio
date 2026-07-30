import { AlertTriangle, Code2, Gauge, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { analyze, computePlanRows, fmt, partsDurationSum } from "@/lib/query-plan";
import type { ProfileData } from "@/lib/query-plan";

// Types live in the pure logic module; re-export so existing importers
// (ExasolStudio, tabs) keep importing them from here.
export type { ProfileData, ProfilePart } from "@/lib/query-plan";

/** Per-query performance: exact engine measurements, our analysis on top. */
export function QueryProfileView({ data, onOpenSql }: { data: ProfileData; onOpenSql?: (sql: string, title?: string) => void }) {
  const wallTime = data.wall?.duration ?? null;
  const partsSum = partsDurationSum(data.parts);
  const insights = analyze(data.parts, data.wall);
  const planRows = computePlanRows(data.parts, data.wall);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-editor px-5 py-4 [scrollbar-width:thin]">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-1 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h2 className="text-[14px] font-bold text-foreground">Query performance</h2>
          <span className="rounded bg-secondary px-1.5 py-px font-mono text-[10px] uppercase text-muted-foreground">{data.commandName}</span>
          {onOpenSql ? (
            <button
              onClick={() => onOpenSql(data.script, "Profile script")}
              className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Open the full profiling script in a query tab (edit and re-run)"
            >
              <Code2 className="h-3 w-3" /> Open script
            </button>
          ) : null}
        </div>
        <p className="mb-3 truncate font-mono text-[11px] text-muted-foreground" title={data.sql}>{data.sql}</p>

        {/* Exact totals — wall time from EXA_USER_SQL_LAST_DAY, the ground truth. */}
        <div className="mb-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Wall time (exact)", wallTime === null ? "—" : `${wallTime.toFixed(3)} s`],
            ["Rows returned", fmt(data.wall?.rowCount, 0)],
            ["CPU (statement)", data.wall?.cpu === null || data.wall?.cpu === undefined ? "—" : `${fmt(data.wall.cpu, 0)} %`],
            ["Temp RAM peak", `${fmt(data.wall?.tempRam ?? Math.max(0, ...data.parts.map((p) => p.tempRam ?? 0)), 1)} MiB`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-panel/50 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="font-mono text-[15px] font-semibold text-foreground">{v}</p>
            </div>
          ))}
        </div>
        <p className="mb-4 text-[10.5px] text-muted-foreground">
          Wall time is the statement's measured runtime (EXA_USER_SQL_LAST_DAY). Step durations below are per-part engine
          measurements — parts run in a parallel pipeline, so their sum ({partsSum.toFixed(3)}s) can exceed the wall time.
        </p>

        {/* Measured facts + recommendations, separated. */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Measured bottlenecks</p>
        <div className="mb-4 space-y-1.5">
          {insights.map((ins, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", ins.severity === "warn" ? "border-warning/40 bg-warning/10" : "border-border bg-panel/50")}>
              {ins.severity === "warn" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> : <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">{ins.fact}</p>
                {ins.advice ? (
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground/80">Recommendation:</span> {ins.advice}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Time share per step — exact measured durations. */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Measured time per step</p>
        <div className="mb-4 space-y-1">
          {planRows.map(({ part: p, sharePct: share }) => {
            return (
              <div key={p.partId} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-[11px] text-foreground" title={`${p.name}${p.object ? ` · ${p.object}` : ""}${p.remarks ? ` — ${p.remarks}` : ""}`}>
                  {p.partId}. {p.name}{p.object ? ` · ${p.object}` : ""}
                </span>
                <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-secondary/60">
                  <div className={cn("h-full rounded", share >= 35 ? "bg-warning" : "bg-primary/70")} style={{ width: `${Math.min(Math.max(share, 0.5), 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">{(p.duration ?? 0).toFixed(3)}s · {share.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        {/* Full step table — every measured column, including the engine's remarks. */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Execution steps (engine parts)</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-secondary text-left">
                {["#", "Step", "Detail", "Object", "Rows in", "Rows out", "Seconds", "CPU %", "Temp RAM", "Disk R/W", "Net MiB", "Engine remarks"].map((h) => (
                  <th key={h} className="border-b border-border px-2.5 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.parts.map((p) => (
                <tr key={p.partId} className="even:bg-secondary/20">
                  <td className="px-2.5 py-1 text-muted-foreground">{p.partId}</td>
                  <td className="px-2.5 py-1 text-foreground">{p.name}</td>
                  <td className="max-w-44 truncate px-2.5 py-1 text-muted-foreground" title={p.info ?? ""}>{p.info ?? ""}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">{p.object ? `${p.schema}.${p.object}` : ""}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.inRows ?? p.objectRows, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.outRows, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-foreground">{fmt(p.duration, 3)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.cpu, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.tempRam, 1)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.hddRead, 1)}/{fmt(p.hddWrite, 1)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.net, 1)}</td>
                  <td className="max-w-52 truncate px-2.5 py-1 text-muted-foreground" title={p.remarks ?? ""}>{p.remarks ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 pb-4 text-[10.5px] text-muted-foreground">
          All numbers are the engine's own measurements for THIS run (statement id resolved exactly via CURRENT_STATEMENT).
          Profile runs are kept in SQL history; raw parts stay in EXA_STATISTICS for later analysis.
        </p>
      </div>
    </div>
  );
}
