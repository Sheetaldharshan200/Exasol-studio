import { ChevronRight, Database, Search, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import { McpMark } from "@/components/brand/McpMark";
import { cn } from "@/lib/utils";
import type { ResolvedCatalogItem } from "../catalog-data";
import type { ItemState } from "../item-state";
import { SECTIONS, sectionOf, type SectionKey } from "./filters";
import { HubCard } from "./HubCard";

export type Featured = { eyebrow: string; title: string; body: string; art: "database" | "federation" | "mcp"; onClick: () => void };

/** The three editorial cards at the top of the home page — a headline, two
 *  lines of body, and an illustration panel below. */
function FeaturedCard({ f }: { f: Featured }) {
  const Art = f.art === "database" ? Database : f.art === "federation" ? Waypoints : null;
  return (
    <button
      onClick={f.onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-panel text-left transition-colors hover:border-foreground/25"
    >
      <div className="flex-1 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{f.eyebrow}</p>
        <h3 className="mt-1 text-[17px] font-semibold leading-snug text-foreground">{f.title}</h3>
        <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/80">{f.body}</p>
      </div>
      {/* The art: a deep-blue panel with soft waves, one big mark — the same
          in both themes, like a printed poster. */}
      <div className="relative flex h-[168px] items-center justify-center overflow-hidden bg-[#0f1f4d]">
        <div className="absolute inset-0 opacity-60 [background:radial-gradient(60%_80%_at_20%_100%,#1e3a8a_0%,transparent_60%),radial-gradient(50%_70%_at_85%_10%,#1d4ed8_0%,transparent_55%),radial-gradient(40%_60%_at_60%_60%,#172554_0%,transparent_60%)]" />
        <div className="absolute inset-x-[-20%] top-[55%] h-24 rotate-[-6deg] rounded-[100%] bg-[#1e3a8a]/50" />
        <div className="absolute inset-x-[-20%] top-[75%] h-24 rotate-[-6deg] rounded-[100%] bg-[#1d4ed8]/25" />
        <div className="relative flex items-center gap-4 text-white">
          {Art ? <Art className="h-14 w-14" strokeWidth={1.4} /> : <McpMark className="h-14 w-14 text-white" />}
        </div>
      </div>
    </button>
  );
}

/**
 * Marketplace home, Docker-Hub shaped: title, one big search, three featured
 * cards, then a two-column shelf per category with a "View category" link,
 * and "Recently updated" at the end.
 */
export function HubHome({
  items,
  stateOf,
  query,
  onQuery,
  onSearch,
  onOpenSection,
  onOpen,
  featured,
  selection,
  updatesBanner,
}: {
  items: ResolvedCatalogItem[];
  stateOf: (item: ResolvedCatalogItem) => ItemState;
  query: string;
  onQuery: (q: string) => void;
  onSearch: () => void;
  onOpenSection: (key: SectionKey) => void;
  onOpen: (id: string) => void;
  featured: Featured[];
  selection: { selectable: (item: ResolvedCatalogItem) => boolean; selected: Set<string>; toggle: (id: string) => void };
  /** Shown above the shelves when updates are waiting. */
  updatesBanner?: ReactNode;
}) {
  const card = (item: ResolvedCatalogItem) => (
    <HubCard
      key={item.id}
      item={item}
      state={stateOf(item)}
      selectable={selection.selectable(item)}
      selected={selection.selected.has(item.id)}
      onToggleSelect={() => selection.toggle(item.id)}
      onOpen={() => onOpen(item.id)}
    />
  );
  const recent = [...items].filter((i) => i.pushedAt).sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "")).slice(0, 4);
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-heading text-[22px] font-bold text-foreground">Marketplace</h1>
        <form
          className="mt-3 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
        >
          <label className="relative flex h-12 flex-1 items-center rounded-lg border border-border bg-panel focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="pointer-events-none absolute left-4 h-5 w-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search tools like “exapump” or “MCP”"
              data-agent-id="market.search"
              className="h-full w-full bg-transparent pl-12 pr-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button type="submit" className="cta-glow h-12 rounded-lg bg-primary px-6 text-[14px] font-semibold text-primary-foreground hover:bg-primary/85">
            Search
          </button>
        </form>
      </div>

      {updatesBanner}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {featured.map((f) => (
          <FeaturedCard key={f.title} f={f} />
        ))}
      </div>

      {SECTIONS.map((sec) => {
        const shelf = items.filter((i) => sectionOf(i.kind) === sec.key);
        if (!shelf.length) return null;
        return (
          <section key={sec.key} className="border-t border-border pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-[18px] font-semibold text-foreground">{sec.label}</h2>
              <button onClick={() => onOpenSection(sec.key)} className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                View category <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className={cn("grid gap-4", shelf.length === 1 ? "grid-cols-1" : "[grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]")}>{shelf.slice(0, 4).map(card)}</div>
          </section>
        );
      })}

      {recent.length ? (
        <section className="border-t border-border pt-6">
          <h2 className="mb-4 font-heading text-[18px] font-semibold text-foreground">Recently updated</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">{recent.map(card)}</div>
        </section>
      ) : null}
    </div>
  );
}
