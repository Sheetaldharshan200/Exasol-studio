import { useState, type FC } from "react";
import { BarChart3, Check, SquareTerminal } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { parseCanvasPlan, planSummary } from "@/features/assistant/exa/canvas-plan";
import { cn } from "@/lib/utils";

/**
 * The agent's ```canvas fence as one click: the boxes land on the open
 * canvas with their arrows and run. When no canvas is open, the plan waits
 * for the Visualizer's Build mode and lands the moment it opens.
 */
export const CanvasPlanBlock: FC<{ code: string }> = ({ code }) => {
  const [added, setAdded] = useState(false);
  const plan = parseCanvasPlan(code);
  if (!plan) {
    return (
      <pre className="aui-md-pre border-border/50 bg-muted/30 mt-3 overflow-x-auto rounded-xl border p-3.5 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    );
  }
  const add = () => {
    try {
      sessionStorage.setItem("exa.canvas.pending", JSON.stringify(plan));
    } catch {
      /* the event below still reaches an open canvas */
    }
    // An open canvas takes the plan now (and clears the pending copy); none open → the
    // Visualizer opens in Build mode and picks it up on mount.
    window.dispatchEvent(new CustomEvent("studio:canvas-apply", { detail: { plan } }));
    window.dispatchEvent(new Event("studio:open-visualizer"));
    window.dispatchEvent(new CustomEvent("studio:visualizer-mode", { detail: { mode: "build" } }));
    setAdded(true);
  };
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-panel/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon name="visualizer" className="h-4 w-4 shrink-0 text-[#a78bfa]" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{plan.title ?? "Add to the canvas"}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{planSummary(plan)}</span>
      </div>
      <ul className="px-3 py-1.5">
        {plan.boxes.slice(0, 6).map((b) => (
          <li key={b.name} className="flex items-center gap-2 py-0.5 text-[12px] text-muted-foreground">
            {b.kind === "chart" ? <BarChart3 className="h-3 w-3 shrink-0 text-primary/70" /> : <SquareTerminal className="h-3 w-3 shrink-0 text-[#a78bfa]" />}
            <span className="truncate">
              {b.name}
              {b.kind === "chart" ? ` — ${b.chart} on ${b.source}` : b.source ? ` — on ${Array.isArray(b.source) ? b.source.join(", ") : b.source}` : ""}
            </span>
          </li>
        ))}
        {plan.boxes.length > 6 ? <li className="py-0.5 text-[11px] text-muted-foreground/70">+{plan.boxes.length - 6} more</li> : null}
      </ul>
      <div className="border-t border-border/60 p-2">
        <button
          onClick={add}
          disabled={added}
          className={cn(
            "flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium",
            added ? "border border-border text-muted-foreground" : "cta-glow bg-primary text-primary-foreground hover:bg-primary/85",
          )}
        >
          {added ? (
            <>
              <Check className="h-3.5 w-3.5" /> Added to the canvas
            </>
          ) : (
            "Add to canvas"
          )}
        </button>
      </div>
    </div>
  );
};
