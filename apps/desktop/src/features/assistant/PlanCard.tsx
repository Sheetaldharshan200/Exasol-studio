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
  const done = plan.steps.filter((s) => s.status === "done").length;
  const failed = plan.steps.some((s) => s.status === "failed");
  const finished = plan.steps.every((s) => s.status === "done" || s.status === "skipped" || s.status === "failed");

  return (
    <div className="mx-3 mb-2 rounded-lg border border-border bg-panel/70">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <ListChecks className={cn("h-3.5 w-3.5 shrink-0", failed ? "text-destructive" : "text-primary")} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground" title={plan.goal}>
          {plan.goal}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {done}/{plan.steps.length}
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
          {plan.steps.map((s) => (
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
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
