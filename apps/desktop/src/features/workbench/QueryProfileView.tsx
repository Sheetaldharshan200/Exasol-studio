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
  outRows: number | null;
  duration: number | null;
  cpu: number | null;
  tempRam: number | null;
  hddRead: number | null;
  net: number | null;
};

export type ProfileData = {
  sql: string;
  script: string;
  commandName: string;
  parts: ProfilePart[];
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits });

/** Our OWN bottleneck analysis — Exasol reports raw step timings; the reading
 *  of WHERE it slowed down and WHAT to change is computed here. */
function analyze(parts: ProfilePart[]): { severity: "warn" | "info"; title: string; advice: string }[] {
  const out: { severity: "warn" | "info"; title: string; advice: string }[] = [];
  const total = parts.reduce((s, p) => s + (p.duration ?? 0), 0);
  if (!total) return out;

  // Dominant step
  const top = [...parts].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
  const share = ((top.duration ?? 0) / total) * 100;
  if (share >= 35) {
    const where = top.object ? ` on ${top.schema}.${top.object}` : "";
    out.push({
      severity: "warn",
      title: `${top.name}${where} dominates the runtime — ${share.toFixed(0)}% of ${total.toFixed(2)}s`,
      advice:
        top.name.includes("SCAN")
          ? scanAdvice(top)
          : top.name.includes("JOIN")
            ? joinAdvice(top, parts)
            : top.name.includes("GROUP")
              ? "High-cardinality grouping. Reduce grouped columns, pre-filter rows before aggregating, or materialize a pre-aggregated table for repeated use."
              : top.name.includes("SORT") || top.name.includes("ORDER")
                ? "Sorting the full result is expensive — add/keep a LIMIT so the engine can top-N instead of full-sorting, or drop ORDER BY when order doesn't matter."
                : top.name.includes("INSERT") || top.name.includes("CREATE")
                  ? "Write step — batch size and commit frequency drive this; larger batches with one commit are fastest."
                  : "Inspect this step's rows in vs out below — reducing its input is usually the lever.",
    });
  }

  // Filter selectivity on scans
  for (const p of parts) {
    if (!p.name.includes("SCAN")) continue;
    const rows = p.objectRows ?? 0;
    const kept = p.outRows ?? 0;
    if (rows > 100_000 && kept > 0 && kept / rows < 0.02) {
      out.push({
        severity: "info",
        title: `Scan of ${p.schema}.${p.object} keeps only ${((kept / rows) * 100).toFixed(2)}% of ${fmt(rows, 0)} rows`,
        advice:
          "Highly selective filter over a big table: consider PARTITION BY on the filter column (Exasol prunes partitions), or keep a smaller derived table if this filter is routine.",
      });
    }
  }

  // Join fan-out
  for (const p of parts) {
    if (!p.name.includes("JOIN")) continue;
    const inRows = p.objectRows ?? 0;
    const outRows = p.outRows ?? 0;
    if (inRows > 0 && outRows > inRows * 3 && outRows > 100_000) {
      out.push({
        severity: "warn",
        title: `Join fan-out: ${fmt(inRows, 0)} rows became ${fmt(outRows, 0)}`,
        advice:
          "The join multiplies rows — a missing/duplicate key double-counts downstream aggregates. Verify the join keys are unique on one side, or aggregate to the join grain first.",
      });
      break;
    }
  }

  // Network = data shipped between nodes (global join / distribution mismatch)
  const net = parts.reduce((s, p) => s + (p.net ?? 0), 0);
  if (net > 50) {
    out.push({
      severity: "warn",
      title: `${fmt(net, 0)} MiB shipped between nodes during execution`,
      advice:
        "Joins/groups are redistributing data (global join). Align tables with DISTRIBUTE BY on the join column so matching rows live on the same node — often the single biggest Exasol speedup.",
    });
  }

  // Disk spill
  const hdd = parts.reduce((s, p) => s + (p.hddRead ?? 0), 0);
  if (hdd > 0) {
    out.push({
      severity: "warn",
      title: `${fmt(hdd, 0)} MiB read from disk — the working set didn't fit in RAM`,
      advice: "Reduce columns/rows touched (SELECT only what you need, filter earlier) or give the database more DB RAM.",
    });
  }

  // One-time index build
  if (parts.some((p) => p.name.includes("INDEX") && p.name.includes("CREATE"))) {
    out.push({
      severity: "info",
      title: "The engine built an index during this run (one-time cost)",
      advice: "Exasol auto-creates and persists join indexes — the next run of this query will skip this step and be faster.",
    });
  }

  if (!out.length) {
    out.push({ severity: "info", title: "No obvious bottleneck", advice: "Time is spread across steps with healthy row reduction — this query looks well-shaped for the engine." });
  }
  return out;
}

function scanAdvice(p: ProfilePart): string {
  const rows = p.objectRows ?? 0;
  const kept = p.outRows ?? 0;
  const sel = rows > 0 ? kept / rows : 1;
  if (sel < 0.05)
    return "The scan reads far more than it keeps. PARTITION BY the filter column (partition pruning), or maintain a filtered derived table for this routine slice.";
  return "Most of the table is genuinely needed — reduce the column set (Exasol is columnar: fewer columns = less I/O), or pre-aggregate if this query repeats.";
}

function joinAdvice(p: ProfilePart, parts: ProfilePart[]): string {
  const net = parts.reduce((s, x) => s + (x.net ?? 0), 0);
  if (net > 10)
    return "This join ships data between nodes. DISTRIBUTE BY the join column on both tables so it becomes a local join — typically the biggest single win.";
  return "Check the smaller side is the lookup side and join keys are typed identically (implicit casts disable the join index).";
}

/** The computed per-query performance view: summary → our bottleneck reading →
 *  time-share bars → the full step table. */
export function QueryProfileView({ data, onOpenSql }: { data: ProfileData; onOpenSql?: (sql: string, title?: string) => void }) {
  const total = data.parts.reduce((s, p) => s + (p.duration ?? 0), 0);
  const totalCpu = data.parts.length ? data.parts.reduce((s, p) => s + (p.cpu ?? 0), 0) / data.parts.length : 0;
  const peakRam = Math.max(0, ...data.parts.map((p) => p.tempRam ?? 0));
  const outRows = data.parts.length ? data.parts[data.parts.length - 1].outRows : null;
  const insights = analyze(data.parts);

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

        {/* Summary */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Total time", `${total.toFixed(3)} s`],
            ["Avg CPU", `${totalCpu.toFixed(0)} %`],
            ["Peak temp RAM", `${fmt(peakRam, 1)} MiB`],
            ["Rows out", fmt(outRows, 0)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-panel/50 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="font-mono text-[15px] font-semibold text-foreground">{v}</p>
            </div>
          ))}
        </div>

        {/* Our reading of the bottlenecks */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Where it slows down — and what to change</p>
        <div className="mb-4 space-y-1.5">
          {insights.map((ins, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", ins.severity === "warn" ? "border-warning/40 bg-warning/10" : "border-border bg-panel/50")}>
              {ins.severity === "warn" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> : <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">{ins.title}</p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">{ins.advice}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Time share per step */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Time per step</p>
        <div className="mb-4 space-y-1">
          {data.parts.map((p) => {
            const share = total > 0 ? ((p.duration ?? 0) / total) * 100 : 0;
            return (
              <div key={p.partId} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-[11px] text-foreground" title={`${p.name}${p.object ? ` · ${p.object}` : ""}`}>
                  {p.partId}. {p.name}{p.object ? ` · ${p.object}` : ""}
                </span>
                <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-secondary/60">
                  <div className={cn("h-full rounded", share >= 35 ? "bg-warning" : "bg-primary/70")} style={{ width: `${Math.max(share, 0.5)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">{(p.duration ?? 0).toFixed(3)}s · {share.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        {/* Full step table */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Execution steps (engine parts)</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-secondary text-left">
                {["#", "Step", "Detail", "Object", "Rows in", "Rows out", "Seconds", "CPU %", "Temp RAM", "Disk MiB", "Net MiB"].map((h) => (
                  <th key={h} className="border-b border-border px-2.5 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.parts.map((p) => (
                <tr key={p.partId} className="even:bg-secondary/20">
                  <td className="px-2.5 py-1 text-muted-foreground">{p.partId}</td>
                  <td className="px-2.5 py-1 text-foreground">{p.name}</td>
                  <td className="max-w-48 truncate px-2.5 py-1 text-muted-foreground" title={p.info ?? ""}>{p.info ?? ""}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">{p.object ? `${p.schema}.${p.object}` : ""}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.objectRows, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.outRows, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-foreground">{fmt(p.duration, 3)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.cpu, 0)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.tempRam, 1)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.hddRead, 1)}</td>
                  <td className="px-2.5 py-1 text-right text-muted-foreground">{fmt(p.net, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 pb-4 text-[10.5px] text-muted-foreground">
          Profile runs are kept in SQL history, and the raw step data stays in EXA_STATISTICS — both usable for later analysis.
        </p>
      </div>
    </div>
  );
}
