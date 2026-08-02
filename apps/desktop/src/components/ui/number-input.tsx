import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clampToRange, draftCommitValue, normalizeNumericDraft } from "@/lib/numeric-draft";

/**
 * Numeric field without the controlled <input type="number"> pitfalls:
 * backspacing everything leaves the field EMPTY (not a stuck 0), retyping
 * never shows a leading zero, and in-range values commit as you type.
 * Leaving the field empty or out of range clamps back on blur.
 */
export function NumberInput({
  value,
  min,
  max,
  allowDecimal,
  onCommit,
  className,
  ...rest
}: {
  value: number;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  onCommit: (n: number) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "className">) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // Follow external changes (resets, other windows) — but never stomp what
  // the user is mid-typing.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const next = normalizeNumericDraft(e.target.value, allowDecimal);
        setDraft(next);
        const commit = draftCommitValue(next, min, max);
        if (commit !== null && commit !== value) onCommit(commit);
      }}
      onBlur={(e) => {
        focused.current = false;
        const n = draft === "" || draft === "." ? value : clampToRange(Number(draft), min, max);
        setDraft(String(n));
        if (n !== value) onCommit(n);
        rest.onBlur?.(e);
      }}
      className={cn(
        "rounded-md border border-border bg-panel px-2 text-right font-mono outline-none focus:border-primary/50",
        className,
      )}
    />
  );
}
