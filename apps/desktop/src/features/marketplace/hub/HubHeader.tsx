import { ChevronRight, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeAge } from "./filters";

export type HubPage = "home" | "search" | "updates" | "installed" | "installing" | "kits" | "ai-clients" | "detail";

const LINKS: { key: HubPage; label: string }[] = [
  { key: "kits", label: "Kits" },
  { key: "updates", label: "Updates" },
  { key: "installed", label: "Installed" },
  { key: "ai-clients", label: "AI clients" },
];

/**
 * The strip every Marketplace page starts with: the breadcrumb on the left
 * ("Marketplace / Search", "Marketplace / exasol/exapump"), the four standing
 * destinations on the right, and the one refresh that re-syncs everything
 * together with its "Checked …" stamp.
 */
export function HubHeader({
  page,
  crumb,
  counts,
  checkedAt,
  refreshing,
  onNavigate,
  onRefresh,
}: {
  page: HubPage;
  /** The current page's name after "Marketplace /"; null on the home page. */
  crumb: string | null;
  counts: Partial<Record<HubPage, number>>;
  checkedAt: number | null;
  refreshing: boolean;
  onNavigate: (page: HubPage) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border pb-3">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[14px]">
        <button
          onClick={() => onNavigate("home")}
          className={cn("font-heading font-semibold", crumb ? "text-primary hover:underline" : "text-foreground")}
        >
          Marketplace
        </button>
        {crumb ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="truncate text-foreground">{crumb}</span>
          </>
        ) : null}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {LINKS.map((l) => {
          const n = counts[l.key] ?? 0;
          const active = page === l.key;
          return (
            <button
              key={l.key}
              onClick={() => onNavigate(l.key)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors",
                active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {l.label}
              {n > 0 ? (
                <span className={cn("rounded-full px-1.5 text-[10px] font-medium", l.key === "updates" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Check everything again — installed versions, catalog, releases"
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : checkedAt ? `Checked ${relativeAge(new Date(checkedAt).toISOString()) === "today" ? "just now" : relativeAge(new Date(checkedAt).toISOString())}` : "Check now"}
        </button>
      </div>
    </div>
  );
}
