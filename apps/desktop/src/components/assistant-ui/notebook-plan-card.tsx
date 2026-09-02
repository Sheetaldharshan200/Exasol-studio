import { useState, type FC } from "react";
import { Check, LineChart } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cellLabel, parseNotebookPlan } from "@/features/assistant/exa/notebook-plan";
import { addNotebookDoc } from "@/features/workbench/notebook-store";
import { cn } from "@/lib/utils";

/**
 * Renders the agent's ```notebook fence as a one-click builder: the JSON plan
 * (validated in notebook-plan.ts) becomes a real notebook — markdown intro,
 * one SQL cell per panel with its chart hint — and the Notebook tab opens on
 * it. An unparseable block falls back to a plain code fence so nothing is
 * silently swallowed.
 */
export const NotebookPlanBlock: FC<{ code: string }> = ({ code }) => {
  const [created, setCreated] = useState(false);
  const plan = parseNotebookPlan(code);
  if (!plan) {
    return (
      <pre className="aui-md-pre border-border/50 bg-muted/30 mt-3 overflow-x-auto rounded-xl border p-3.5 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    );
  }
  const charts = plan.cells.filter((c) => c.chart).length;
  const create = () => {
    addNotebookDoc(plan.title, plan.cells);
    window.dispatchEvent(new Event("studio:open-notebook"));
    // Run + verify automatically once the tab has mounted and loaded the new
    // cells — the user lands on rendered results/charts, not empty editors.
    window.setTimeout(() => window.dispatchEvent(new Event("studio:notebook-run-all")), 700);
    setCreated(true);
  };
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-panel/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon name="notebook" className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{plan.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {plan.cells.length} cell{plan.cells.length === 1 ? "" : "s"}
          {charts ? ` · ${charts} chart${charts === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <ul className="px-3 py-1.5">
        {plan.cells.slice(0, 6).map((c, i) => (
          <li key={i} className="flex items-center gap-2 py-0.5 text-[12px] text-muted-foreground">
            {c.chart ? <LineChart className="h-3 w-3 shrink-0 text-primary/70" /> : <span className="h-3 w-3 shrink-0 text-center font-mono text-[10px] leading-3">{c.type === "markdown" ? "M" : c.type === "mermaid" ? "◇" : "S"}</span>}
            <span className="truncate">{cellLabel(c)}</span>
          </li>
        ))}
        {plan.cells.length > 6 ? <li className="py-0.5 text-[11px] text-muted-foreground/70">+{plan.cells.length - 6} more</li> : null}
      </ul>
      <div className="border-t border-border/60 p-2">
        <button
          onClick={create}
          disabled={created}
          className={cn(
            "flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium",
            created ? "border border-border text-muted-foreground" : "cta-glow bg-primary text-primary-foreground hover:bg-primary/85",
          )}
        >
          {created ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" /> Notebook created — opening & running
            </>
          ) : (
            <>
              <Icon name="notebook" className="h-3.5 w-3.5" /> Create notebook
            </>
          )}
        </button>
      </div>
    </div>
  );
};
