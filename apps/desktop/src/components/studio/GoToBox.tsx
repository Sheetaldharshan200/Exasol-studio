import { cn } from "@/lib/utils";

/**
 * Numeric "go to #" jump box for the scrolling tab strips (results + query
 * plans). Placed on BOTH ends of a strip; sticky so each stays visible at its
 * edge no matter how far the strip is scrolled.
 */
export function GoToBox({
  value,
  onChange,
  max,
  side,
  className,
}: {
  value: string;
  onChange: (raw: string) => void;
  max: number;
  side: "left" | "right";
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="#"
      inputMode="numeric"
      aria-label={`Go to 1–${max}`}
      title={`Go to 1–${max}`}
      className={cn(
        "sticky z-10 shrink-0 rounded-md border border-border bg-editor text-center font-mono outline-none placeholder:text-muted-foreground/60 focus:border-primary/50",
        side === "left" ? "left-0" : "right-0 ml-auto",
        className,
      )}
    />
  );
}
