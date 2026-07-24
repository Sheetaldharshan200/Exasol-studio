import { useRef, useState } from "react";
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

  async function run() {
    if (state === "busy") return;
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    // Only surface the spinner when the copy is actually slow — instant
    // copies jump straight to the check so the animation stays calm.
    const slow = window.setTimeout(() => setState("busy"), 120);
    try {
      const value = typeof text === "function" ? await text() : text;
      await navigator.clipboard?.writeText(value);
      window.clearTimeout(slow);
      setState("done");
      resetTimer.current = window.setTimeout(() => setState("idle"), 1500);
    } catch {
      window.clearTimeout(slow);
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
