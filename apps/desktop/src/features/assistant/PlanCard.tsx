// P2 (docs/agentic-architecture-spec.md): the agent's explicit plan, rendered
// live above the thread. Fed by "studio:plan-updated" window events (pushed
// through the gateway action bridge whenever the agent proposes or advances a
// plan). Purely informational — approval happens in the CONVERSATION (the
// agent must wait for the user's go-ahead before approve_plan).

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleDashed, ListChecks, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanStep = {
  id: string;
  title: string;
  tool?: string;
  sql?: string;
  dependsOn: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  note?: string;
  /** P5: id of a compensation step that runs only if this one fails hard. */
  onFailure?: string;
};

type Plan = {
  id: string;
  goal: string;
  updatedAt: number;
  steps: PlanStep[];
  requiresApproval: boolean;
  approved: boolean;
};

function StepIcon({ status }: { status: PlanStep["status"] }) {
  if (status === "done") return <Check className="h-3 w-3 text-primary" />;
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
  if (status === "failed") return <X className="h-3 w-3 text-destructive" />;
  if (status === "skipped") return <CircleDashed className="h-3 w-3 text-muted-foreground/50" />;
  return <CircleDashed className="h-3 w-3 text-muted-foreground" />;
}

export function PlanCard() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    const onPlan = (e: Event) => {
      const next = (e as CustomEvent<Plan>).detail;
      if (next?.id && Array.isArray(next.steps)) {
        setPlan(next);
        // A NEW plan un-dismisses the card; updates to a dismissed one stay quiet.
        setDismissedId((d) => (d && d !== next.id ? null : d));
      }
    };
    window.addEventListener("studio:plan-updated", onPlan);
    return () => window.removeEventListener("studio:plan-updated", onPlan);
  }, []);

  if (!plan || dismissedId === plan.id) return null;
  // Compensation steps count only once triggered (mirrors planProgress).
  const comps = new Set(plan.steps.map((s) => s.onFailure).filter(Boolean) as string[]);
  const counted = plan.steps.filter((s) => !comps.has(s.id) || s.status !== "pending");
  const done = counted.filter((s) => s.status === "done").length;
  const running = counted.filter((s) => s.status === "running").length;
  const failed = counted.some((s) => s.status === "failed");
  const finished = counted.every((s) => s.status === "done" || s.status === "skipped" || s.status === "failed");
  const titleOf = (id: string) => plan.steps.find((s) => s.id === id)?.title ?? id;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-border bg-panel/70">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <ListChecks className={cn("h-3.5 w-3.5 shrink-0", failed ? "text-destructive" : "text-primary")} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground" title={plan.goal}>
          {plan.goal}
        </span>
        {running > 1 ? (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-px text-[9px] font-medium uppercase text-primary">
            {running} in parallel
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {done}/{counted.length}
        </span>
        {plan.requiresApproval && !plan.approved ? (
          <span className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[9px] font-medium uppercase text-warning">
            awaiting your go-ahead
          </span>
        ) : null}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand plan" : "Collapse plan"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {finished ? (
          <button
            onClick={() => setDismissedId(plan.id)}
            aria-label="Dismiss plan"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <ul className="border-t border-border/60 px-2.5 py-1.5">
          {plan.steps.map((s) => {
            const isComp = comps.has(s.id);
            if (isComp && s.status === "pending") {
              // Untriggered compensation: shown dimmed so the safety net is
              // visible without implying it will run.
              return (
                <li key={s.id} className="flex items-start gap-2 py-0.5 opacity-50">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    <CircleDashed className="h-3 w-3 text-muted-foreground/50" />
                  </span>
                  <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted-foreground">
                    {s.title}
                    <span className="ml-1.5 rounded bg-secondary px-1 py-px text-[9px] uppercase">on failure</span>
                  </span>
                </li>
              );
            }
            const waitingOn = s.status === "pending" ? s.dependsOn.filter((d) => plan.steps.find((x) => x.id === d)?.status !== "done") : [];
            return (
              <li key={s.id} className="flex items-start gap-2 py-0.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  <StepIcon status={s.status} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[11.5px] leading-snug",
                    s.status === "done" ? "text-muted-foreground" : "text-foreground",
                    s.status === "skipped" && "text-muted-foreground/60 line-through",
                  )}
                >
                  {s.title}
                  {s.note ? <span className="text-muted-foreground"> — {s.note}</span> : null}
                  {waitingOn.length ? (
                    <span className="text-muted-foreground/70"> · after {waitingOn.map(titleOf).join(", ")}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
