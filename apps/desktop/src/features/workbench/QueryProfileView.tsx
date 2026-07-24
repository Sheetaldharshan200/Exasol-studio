import { AlertTriangle, Code2, Gauge, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/** One engine execution step (a row of EXA_STATISTICS.EXA_USER_PROFILE_LAST_DAY). */
export type ProfilePart = {
  partId: number;
  name: string;
  info: string | null;
  schema: string | null;
  object: string | null;
  objectRows: number | null;
  /** Rows entering this part — the exact basis for selectivity/fan-out. */
  inRows: number | null;
  outRows: number | null;
  duration: number | null;
  cpu: number | null;
  tempRam: number | null;
  hddRead: number | null;
  hddWrite: number | null;
  net: number | null;
  /** The engine's own note for the part (e.g. which index it used/built). */
  remarks: string | null;
};

export type ProfileData = {
  sql: string;
  script: string;
  commandName: string;
  parts: ProfilePart[];
  /** The statement's EXACT totals from EXA_USER_SQL_LAST_DAY (wall time —
   *  part durations overlap under parallel execution and must not be summed). */
  wall: {
    duration: number | null;
    commandName: string;
    rowCount: number | null;
    cpu: number | null;
    tempRam: number | null;
    hddRead: number | null;
    net: number | null;
  } | null;
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits });

type Insight = { severity: "warn" | "info"; fact: string; advice?: string };

/** Measured facts first (exact numbers from the engine), each with an optional
 *  recommendation — clearly separated so nothing reads as more than it is. */
function analyze(parts: ProfilePart[], wall: ProfileData["wall"]): Insight[] {
  const out: Insight[] = [];
  const denom = wall?.duration ?? parts.reduce((s, p) => s + (p.duration ?? 0), 0);
  if (!denom) return out;

  // FACT: slowest part, exact measured duration.
  const top = [...parts].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  if ((top?.duration ?? 0) > 0) {
    const where = top.object ? ` on ${top.schema}.${top.object}` : "";
    out.push({
      severity: (top.duration ?? 0) / denom >= 0.35 ? "warn" : "info",
      fact: `Slowest step: ${top.name}${where} — ${fmt(top.duration, 3)}s measured (${(((top.duration ?? 0) / denom) * 100).toFixed(0)}% of the ${fmt(denom, 2)}s wall time).`,
      advice: adviceFor(top, parts),
    });
  }

  // FACT: scan selectivity — exact, from IN_ROWS/OUT_ROWS when present.
  for (const p of parts) {
    if (!p.name.includes("SCAN")) continue;
    const inn = p.inRows ?? p.objectRows;
    const outR = p.outRows;
    if (inn !== null && outR !== null && inn > 100_000 && outR / inn < 0.02) {
      out.push({
        severity: "info",
        fact: `Scan of ${p.schema}.${p.object}: ${fmt(inn, 0)} rows in → ${fmt(outR, 0)} out (${((outR / inn) * 100).toFixed(2)}% kept), ${fmt(p.duration, 3)}s.`,
        advice: "Highly selective filter over a large table — PARTITION BY the filter column (partition pruning) or maintain a filtered derived table if this slice is routine.",
      });
    }
  }

  // FACT: join fan-out — exact from IN_ROWS → OUT_ROWS on the join part.
  for (const p of parts) {
    if (!p.name.includes("JOIN")) continue;
    const inn = p.inRows;
    const outR = p.outRows;
    if (inn !== null && outR !== null && inn > 0 && outR > inn * 2 && outR > 100_000) {
      out.push({
        severity: "warn",
        fact: `${p.name}${p.object ? ` with ${p.schema}.${p.object}` : ""}: ${fmt(inn, 0)} rows in → ${fmt(outR, 0)} out (×${(outR / inn).toFixed(1)} fan-out), ${fmt(p.duration, 3)}s.`,
        advice: "Row multiplication in a join double-counts downstream aggregates — verify key uniqueness on the lookup side, or aggregate to the join grain first.",
      });
      break;
    }
  }

  // FACT: inter-node traffic (exact MiB from the NET column).
  const net = parts.reduce((s, p) => s + (p.net ?? 0), 0);
  if (net > 50) {
    out.push({
      severity: "warn",
      fact: `${fmt(net, 0)} MiB moved between cluster nodes during execution (NET column).`,
      advice: "Joins/groups are redistributing data (global join). DISTRIBUTE BY the join column on both tables so matching rows are co-located — usually the biggest single Exasol win.",
    });
  }

  // FACT: disk I/O (exact MiB) — the working set didn't fit in RAM.
  const hdd = parts.reduce((s, p) => s + (p.hddRead ?? 0) + (p.hddWrite ?? 0), 0);
  if (hdd > 0) {
    out.push({
      severity: "warn",
      fact: `${fmt(hdd, 0)} MiB of disk I/O (HDD_READ/HDD_WRITE) — data was not fully resident in RAM.`,
      advice: "Touch fewer columns (Exasol is columnar), filter earlier, or increase DB RAM.",
    });
  }

  // FACT: the engine's own remarks (index built/used) — verbatim.
  for (const p of parts) {
    if (p.remarks && /index/i.test(p.remarks)) {
      out.push({
        severity: "info",
        fact: `Engine remark on ${p.name}: "${p.remarks}".`,
        advice: /creat/i.test(p.remarks) ? "Index creation is a one-time cost — the next run of this query skips it." : undefined,
      });
    }
  }

  if (!out.length) out.push({ severity: "info", fact: "No dominant step or resource pressure measured — time is spread across steps with healthy row reduction." });
  return out;
}

function adviceFor(p: ProfilePart, parts: ProfilePart[]): string | undefined {
  if (p.name.includes("SCAN")) {
    const inn = p.inRows ?? p.objectRows ?? 0;
    const kept = p.outRows ?? 0;
    return inn > 0 && kept / inn < 0.05
      ? "The scan reads far more than it keeps — PARTITION BY the filter column, or keep a filtered derived table for this routine slice."
      : "Most of the table is genuinely needed — select fewer columns (columnar I/O), or pre-aggregate if this query repeats.";
  }
  if (p.name.includes("JOIN")) {
    const net = parts.reduce((s, x) => s + (x.net ?? 0), 0);
    return net > 10
      ? "This join ships data between nodes — DISTRIBUTE BY the join column on both tables to make it a local join."
      : "Check join keys are typed identically (implicit casts disable the join index) and unique on the lookup side.";
  }
  if (p.name.includes("GROUP")) return "High-cardinality grouping — pre-filter rows before aggregating, group on fewer columns, or materialize a pre-aggregate for repeated use.";
  if (p.name.includes("SORT") || p.name.includes("ORDER")) return "Full-result sorting — keep a LIMIT so the engine can top-N instead, or drop ORDER BY where order doesn't matter.";
  if (p.name.includes("INSERT") || p.name.includes("CREATE")) return "Write step — larger batches with a single commit are fastest.";
  return undefined;
}

/** Per-query performance: exact engine measurements, our analysis on top. */
export function QueryProfileView({ data, onOpenSql }: { data: ProfileData; onOpenSql?: (sql: string, title?: string) => void }) {
  const wallTime = data.wall?.duration ?? null;
  const partsSum = data.parts.reduce((s, p) => s + (p.duration ?? 0), 0);
  const denom = wallTime ?? partsSum;
  const insights = analyze(data.parts, data.wall);

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
          {data.parts.map((p) => {
            const share = denom > 0 ? ((p.duration ?? 0) / denom) * 100 : 0;
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
