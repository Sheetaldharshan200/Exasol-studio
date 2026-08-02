import { useEffect, useMemo, useRef, useState } from "react";
import { SquareArrowOutUpRight, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Plan } from "@/lib/plan-model";
import { statementVerb } from "@/lib/result-stats";
import { QueryPlanView } from "./QueryPlanView";
import { GoToBox } from "./GoToBox";

/** First meaningful words of a statement for its tab label / overview row. */
function stmtLabel(plan: Plan, index: number): string {
  const text = (plan.queryText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return `Statement ${index + 1}`;
  return text.length > 46 ? `${text.slice(0, 46)}…` : text;
}

function fmtSeconds(s: number): string {
  return s >= 1 ? `${s.toFixed(2)} s` : `${(s * 1000).toFixed(1)} ms`;
}

/**
 * Query Performance for a whole run. A single statement renders its plan
 * directly; a script gets one tab per statement plus an "All statements"
 * overview (duration share per statement — click a row to open its plan).
 * Starts on the heaviest statement: that is what you came to see.
 */
export function QueryPlanTabs({
  plans,
  onOpenSql,
  onOpenPlanTab,
  savedIdx,
  onIdxChange,
}: {
  plans: Plan[];
  onOpenSql: (sql: string, title?: string) => void;
  onOpenPlanTab: (plan: Plan, title: string) => void;
  /** Selection persisted on the tab, so leaving and returning (or popping the
   *  plan out and closing it) continues where the user left off. */
  savedIdx?: number;
  onIdxChange?: (idx: number) => void;
}) {
  const heaviest = useMemo(() => {
    let best = 0;
    for (let i = 1; i < plans.length; i++) {
      if ((plans[i].totalDuration ?? 0) > (plans[best].totalDuration ?? 0)) best = i;
    }
    return best;
  }, [plans]);
  // -1 = the "All statements" overview.
  const [active, setActiveState] = useState(
    savedIdx !== undefined && savedIdx >= -1 && savedIdx < plans.length ? savedIdx : heaviest,
  );
  const setActive = (i: number) => {
    setActiveState(i);
    onIdxChange?.(i);
  };
  const [goTo, setGoTo] = useState("");
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible — the default (heaviest) or an overview
  // click can land far right, outside the scrolled strip.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      stripRef.current
        ?.querySelector(`[data-idx="${active}"]`)
        ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [active, plans]);

  // Jump to a statement by its number as it is typed (clamped to the run).
  function jumpTo(raw: string) {
    setGoTo(raw.replace(/\D/g, ""));
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= plans.length) setActive(n - 1);
  }

  const openInTab = (p: Plan, i: number) => onOpenPlanTab(p, `Plan · ${i + 1}] ${statementVerb(p.queryText) ?? "statement"}`);

  if (plans.length === 0) return null;
  if (plans.length === 1) return <QueryPlanView plan={plans[0]} onOpenSql={onOpenSql} onOpenInTab={() => openInTab(plans[0], 0)} />;

  const totalAll = plans.reduce((s, p) => s + (p.totalDuration ?? 0), 0);
  const current = active >= 0 ? plans[active] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={stripRef} className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <GoToBox value={goTo} onChange={jumpTo} max={plans.length} side="left" className="h-6 w-11 px-1.5 text-[11px]" />
        <button
          data-idx={-1}
          onClick={() => setActive(-1)}
          className={cn(
            "flex h-6 shrink-0 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
            active === -1 ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          All statements
        </button>
        {plans.map((p, i) => {
          const share = totalAll > 0 ? Math.round(((p.totalDuration ?? 0) / totalAll) * 100) : 0;
          return (
            <button
              key={p.stmtId ?? i}
              data-idx={i}
              onClick={() => setActive(i)}
              title={
                (i === heaviest ? `Slowest statement of this run — ${fmtSeconds(p.totalDuration ?? 0)} (${share}% of the run)\n` : "") +
                (p.queryText ?? "")
              }
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-md px-2 font-mono text-[11px] transition-colors",
                active === i ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {i + 1}] {statementVerb(p.queryText) ?? ""}
              {i === heaviest ? <Timer className="h-3 w-3 text-amber-500" aria-label="Slowest statement" /> : null}
            </button>
          );
        })}
        <GoToBox value={goTo} onChange={jumpTo} max={plans.length} side="right" className="h-6 w-11 px-1.5 text-[11px]" />
      </div>
      {current ? (
        <div className="min-h-0 flex-1">
          <QueryPlanView plan={current} onOpenSql={onOpenSql} onOpenInTab={() => openInTab(current, active)} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-8 pb-2 pr-2 font-semibold">#</th>
                <th className="pb-2 pr-3 font-semibold">Statement</th>
                <th className="w-24 pb-2 pr-3 text-right font-semibold">Time</th>
                <th className="w-20 pb-2 pr-3 text-right font-semibold">Operators</th>
                <th className="w-40 pb-2 font-semibold">Share of run</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => {
                const dur = p.totalDuration ?? 0;
                const share = totalAll > 0 ? (dur / totalAll) * 100 : 0;
                return (
                  <tr
                    key={p.stmtId ?? i}
                    onClick={() => setActive(i)}
                    className="cursor-pointer border-t border-border/60 transition-colors hover:bg-secondary/40"
                  >
                    <td className="py-2 pr-2 font-mono text-muted-foreground">{i + 1}]</td>
                    <td className="max-w-0 truncate py-2 pr-3 font-mono" title={p.queryText}>
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        {i === heaviest ? <Timer className="h-3 w-3 shrink-0 text-amber-500" aria-label="Slowest statement" /> : null}
                        <span className="truncate">{stmtLabel(p, i)}</span>
                        <SquareArrowOutUpRight
                          role="button"
                          aria-label="Open this plan visualizer in a full workbench tab"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInTab(p, i);
                          }}
                          className="h-3 w-3 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        />
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{fmtSeconds(dur)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{p.nodes.length}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn("h-full rounded-full", i === heaviest ? "bg-primary" : "bg-primary/45")}
                            style={{ width: `${Math.max(2, share)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Timer className="h-3 w-3 text-amber-500" /> marks the run's slowest statement. Click a row to open its plan;
            statement times are profile sums, which overlap under parallel execution.
          </p>
        </div>
      )}
    </div>
  );
}
