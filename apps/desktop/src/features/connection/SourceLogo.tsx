import { Database } from "lucide-react";
import { DbMark, DB_MARK_IDS } from "@/components/brand/DbMarks";
import { cn } from "@/lib/utils";

/** Tinted tile with a data-source brand mark, or a generic DB glyph. */
export function SourceLogo({ logo, className }: { logo?: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background",
        className,
      )}
    >
      {logo && DB_MARK_IDS.has(logo) ? (
        <DbMark name={logo} className="h-[18px] w-[18px]" />
      ) : (
        <Database className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}
