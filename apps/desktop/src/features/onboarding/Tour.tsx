import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export type TourStep = {
  /** CSS selector for the element to highlight. */
  selector: string;
  title: string;
  body: string;
  /** Preferred placement of the callout relative to the target. */
  side?: "right" | "left" | "bottom" | "top";
};

const PAD = 8;

/**
 * Lightweight product tour: dims the screen, spotlights each target element,
 * and shows a callout with Back / Next / Skip. Steps whose target isn't in the
 * DOM are skipped automatically.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  // Keep only steps whose target currently exists.
  const active = useMemo(
    () => steps.filter((s) => document.querySelector(s.selector)),
    [steps],
  );
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = active[i];

  useEffect(() => {
    if (active.length === 0) onClose();
  }, [active, onClose]);

  useLayoutEffect(() => {
    if (!step) return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        setRect(el.getBoundingClientRect());
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  if (!step || !rect) return null;

  const next = () => (i < active.length - 1 ? setI(i + 1) : onClose());
  const back = () => setI(Math.max(0, i - 1));

  // Place the callout on the preferred side, clamped to the viewport.
  const side = step.side ?? "right";
  const cardW = 300;
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.right + gap;
  let top = rect.top;
  if (side === "left") left = rect.left - cardW - gap;
  if (side === "bottom") {
    left = rect.left;
    top = rect.bottom + gap;
  }
  if (side === "top") {
    left = rect.left;
    top = rect.top - gap - 150;
  }
  left = Math.min(Math.max(12, left), vw - cardW - 12);
  top = Math.min(Math.max(12, top), vh - 190);

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Spotlight: a transparent hole with a huge shadow dimming everything else. */}
      <div
        className="absolute rounded-xl ring-2 ring-primary/70 transition-all duration-200"
        style={{
          left: rect.left - PAD,
          top: rect.top - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
        }}
      />
      <div
        className="absolute w-[300px] rounded-xl border border-border bg-popover p-4 shadow-2xl"
        style={{ left, top }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow-muted">
            Step {i + 1} of {active.length}
          </span>
          <button
            onClick={onClose}
            aria-label="Skip tour"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 className="text-[14px] font-semibold text-foreground">{step.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
          <div className="flex items-center gap-1.5">
            {i > 0 ? (
              <button
                onClick={back}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : null}
            <button
              onClick={next}
              className="cta-glow flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              {i < active.length - 1 ? "Next" : "Done"}
              {i < active.length - 1 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const STUDIO_TOUR: TourStep[] = [
  {
    selector: '[data-tour="rail"]',
    title: "Activity bar",
    body: "Switch between Databases, Files, Favorites and the Visualizer. The AI assistant lives at the bottom.",
    side: "right",
  },
  {
    selector: '[data-tour="add-connection"]',
    title: "Connect a database",
    body: "Add a connection with +. The connect flow opens as a tab, so your queries stay open while you connect.",
    side: "right",
  },
  {
    selector: '[data-tour="tabbar"]',
    title: "Query tabs",
    body: "Open query tabs with +, double-click a tab to rename it, and pin the ones you want to keep.",
    side: "bottom",
  },
  {
    selector: '[data-tour="visualizer"]',
    title: "Schema visualizer",
    body: "Open the Visualizer to see tables and their foreign-key links as animated beams — select a table to light up its relationships.",
    side: "right",
  },
  {
    selector: '[data-tour="ai-toggle"]',
    title: "AI assistant",
    body: "Show or hide the AI assistant here anytime to get help writing and understanding SQL.",
    side: "bottom",
  },
];
