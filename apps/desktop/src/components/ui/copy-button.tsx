import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one copy affordance for the whole app: click → (spinner while the
 * clipboard call is genuinely pending) → check for a beat → back to the copy
 * glyph. Users always see that the copy HAPPENED, never a dead button.
 */
export function CopyButton({
  text,
  label = "Copy",
  className,
  iconClassName = "h-3.5 w-3.5",
  children,
}: {
  /** The text to copy, or a producer (lets callers defer building big strings). */
  text: string | (() => string | Promise<string>);
  label?: string;
  className?: string;
  iconClassName?: string;
  /** Optional trailing content (e.g. a text label next to the icon). */
  children?: React.ReactNode;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const resetTimer = useRef<number | null>(null);
  const slowTimer = useRef<number | null>(null);

  // Clear any pending timers on unmount so they never setState on a gone
  // component (e.g. a CopyButton in a dialog closed within the 1.5s window).
  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      if (slowTimer.current) window.clearTimeout(slowTimer.current);
    },
    [],
  );

  async function run() {
    if (state === "busy") return;
    // Clear BOTH pending timers first — rapid clicks before the 120ms spinner
    // fires would otherwise orphan earlier slow timers (they'd fire setState
    // after unmount or clobber a later copy's state).
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    // Only surface the spinner when the copy is actually slow — instant
    // copies jump straight to the check so the animation stays calm.
    slowTimer.current = window.setTimeout(() => setState("busy"), 120);
    try {
      const value = typeof text === "function" ? await text() : text;
      await navigator.clipboard?.writeText(value);
      window.clearTimeout(slowTimer.current);
      setState("done");
      resetTimer.current = window.setTimeout(() => setState("idle"), 1500);
    } catch {
      window.clearTimeout(slowTimer.current);
      setState("idle");
    }
  }

  return (
    <button
      onClick={() => void run()}
      title={state === "done" ? "Copied" : label}
      aria-label={state === "done" ? "Copied" : label}
      className={cn(
        "flex items-center justify-center gap-1 rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        state === "done" && "text-primary",
        className ?? "h-6 w-6",
      )}
    >
      {state === "busy" ? (
        <Loader2 className={cn(iconClassName, "animate-spin")} />
      ) : state === "done" ? (
        <Check className={cn(iconClassName, "text-primary")} />
      ) : (
        <Copy className={iconClassName} />
      )}
      {children}
    </button>
  );
}
