import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ResolvedCatalogItem } from "../catalog-data";
import type { ItemState } from "../item-state";
import { activeChips, filterCount, resultRange, SORTS, type HubFilters, type Sort } from "./filters";
import { HubCard } from "./HubCard";

/**
 * The results page: one wide search box, a filter button with the count of
 * active filters, removable chips, "1 - N of M results" with a Sort control,
 * and the three-column card grid.
 */
export function HubSearch({
  title = "Search",
  results,
  total,
  query,
  onQuery,
  filters,
  onFilters,
  onOpenFilters,
  sort,
  onSort,
  stateOf,
  onOpen,
  selection,
  emptyText,
}: {
  title?: string;
  results: ResolvedCatalogItem[];
  total: number;
  query: string;
  onQuery: (q: string) => void;
  filters: HubFilters;
  onFilters: (f: HubFilters) => void;
  onOpenFilters: () => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  stateOf: (item: ResolvedCatalogItem) => ItemState;
  onOpen: (id: string) => void;
  selection: { selectable: (item: ResolvedCatalogItem) => boolean; selected: Set<string>; toggle: (id: string) => void };
  emptyText: string;
}) {
  const chips = activeChips(filters);
  const nFilters = filterCount(filters);
  return (
    <div className="grid gap-5">
      <h1 className="font-heading text-[22px] font-bold text-foreground">{title}</h1>
      <div className="flex items-start gap-4">
        <label className="relative flex h-12 flex-1 items-center rounded-lg border border-border bg-panel focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
          <Search className="pointer-events-none absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search tools like “exapump” or “MCP”"
            data-agent-id="market.search"
            className="h-full w-full bg-transparent pl-12 pr-10 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button onClick={() => onQuery("")} aria-label="Clear search" className="absolute right-3 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <button
          onClick={onOpenFilters}
          aria-label="Filters"
          data-agent-id="market.filters"
          className="relative flex h-12 w-12 items-center justify-center rounded-lg text-primary hover:bg-secondary/60"
        >
          <SlidersHorizontal className="h-6 w-6" />
          {nFilters > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {nFilters}
            </span>
          ) : null}
        </button>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => onFilters(c.remove(filters))}
              className="flex h-8 items-center gap-2 rounded-full bg-primary px-3.5 text-[11.5px] font-semibold uppercase tracking-wide text-primary-foreground hover:bg-primary/85"
            >
              {c.label} <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end justify-between gap-4">
        <p className="text-[16px] text-foreground">{resultRange(results.length, total)}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex h-12 min-w-[200px] items-center justify-between rounded-lg border border-border bg-panel px-4 text-[15px] text-foreground hover:border-foreground/30">
              <span className="absolute -top-2 left-3 bg-editor px-1 text-[11px] text-muted-foreground">Sort</span>
              {SORTS.find((s) => s.key === sort)?.label}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {SORTS.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => onSort(s.key)} className={cn(sort === s.key && "text-primary")}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {results.length ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {results.map((item) => (
            <HubCard
              key={item.id}
              item={item}
              state={stateOf(item)}
              selectable={selection.selectable(item)}
              selected={selection.selected.has(item.id)}
              onToggleSelect={() => selection.toggle(item.id)}
              onOpen={() => onOpen(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <Search className="h-6 w-6 opacity-40" />
          <p className="text-sm">{emptyText}</p>
        </div>
      )}
    </div>
  );
}
