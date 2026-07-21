import { FileText, Server } from "lucide-react";
import { BrandMark, BRAND_MARK_IDS } from "@/components/brand/BrandMarks";
import { cn } from "@/lib/utils";

/**
 * Connector avatar: a real brand mark (GitHub, Jira, Excel, Postgres, SQLite)
 * in its own tinted tile, or a lucide fallback for local files / custom
 * servers. One consistent chip so the MCP list reads at a glance.
 */
export function ConnectorLogo({ logo, className }: { logo?: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background",
        className,
      )}
    >
      {logo && BRAND_MARK_IDS.has(logo) ? (
        <BrandMark name={logo} className="h-4 w-4" />
      ) : logo === "files" ? (
        <FileText className="h-4 w-4 text-info" />
      ) : (
        <Server className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}
