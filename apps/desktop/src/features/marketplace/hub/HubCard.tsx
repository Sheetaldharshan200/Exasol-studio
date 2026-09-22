import { BadgeCheck, Check, Download, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedCatalogItem } from "../catalog-data";
import { stateLabel, type ItemState } from "../item-state";
import { compactCount } from "./filters";
import { HubLogo } from "./HubLogo";

/** Blue check for Exasol-published, a purple ring for Exasol Labs — the two
 *  trust marks the filter rail also uses. */
export function TrustMark({ labs, withLabel = false, className }: { labs?: boolean; withLabel?: boolean; className?: string }) {
  return labs ? (
    <span className={cn("inline-flex items-center gap-1 text-syntax-function", className)} title="Exasol Labs">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] border-current">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {withLabel ? <span className="text-[12.5px] font-medium">Exasol Labs</span> : null}
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 text-info", className)} title="Official Exasol">
      <BadgeCheck className="h-4 w-4" />
      {withLabel ? <span className="text-[12.5px] font-medium">Verified publisher</span> : null}
    </span>
  );
}

/**
 * One catalog result, Docker-Hub shaped: logo · `publisher/name` · trust mark,
 * a two-line description, then a footer with the install fact and the stars.
 * The whole card opens the item; a checkbox in the corner joins it to a batch.
 */
export function HubCard({
  item,
  state,
  selectable,
  selected,
  onToggleSelect,
  onOpen,
}: {
  item: ResolvedCatalogItem;
  state: ItemState;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const stars = compactCount(item.stars);
  const slug = item.repo ?? `exasol/${item.id}`;
  return (
    <div className="relative">
      {selectable ? (
        <button
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${item.name} to install together`}
          onClick={onToggleSelect}
          className={cn(
            "absolute top-5 right-5 z-10 flex h-4.5 w-4.5 items-center justify-center rounded border transition-opacity",
            selected ? "border-primary bg-primary text-primary-foreground opacity-100" : "border-border bg-panel text-transparent opacity-0 hover:opacity-100 focus-visible:opacity-100 [.group:hover_&]:opacity-100",
          )}
        >
          <Check className="h-3 w-3" />
        </button>
      ) : null}
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      data-agent-id={`market.card.${item.id}`}
      className={cn(
        "group relative flex min-h-[188px] cursor-pointer flex-col rounded-xl border bg-panel text-left transition-colors hover:border-foreground/25",
        selected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex-1 p-5">
        <div className="flex items-center gap-3.5 pr-7">
          <HubLogo item={item} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{slug}</span>
              <TrustMark labs={item.labs} className="shrink-0" />
            </div>
          </div>
        </div>
        <p className="mt-3.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/85">{item.description || "No description yet."}</p>
      </div>
      <div className="flex items-center gap-5 border-t border-border px-5 py-3 text-[12.5px] text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1.5", state.kind === "update" && "text-primary")}>
          {state.kind === "installing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state.kind === "installed" || state.kind === "running" || state.kind === "ready" || state.kind === "onSystem" ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {stateLabel(state)}
        </span>
        {stars ? (
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-4 w-4" /> {stars}
          </span>
        ) : null}
      </div>
    </div>
    </div>
  );
}
