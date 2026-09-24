import type { ResolvedCatalogItem, Kind } from "../catalog-data.ts";
import type { ItemState } from "../item-state.ts";
import { fuzzyRank } from "../../../lib/fuzzy.ts";

/** The catalog's shelves — one per Docker-Hub-style "category". */
export type SectionKey = "database" | "load" | "drivers" | "extension" | "vs" | "ai" | "bi" | "library";
export const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: "database", label: "Databases", hint: "Run Exasol locally or in the cloud" },
  { key: "load", label: "Data loading & tools", hint: "Move data in and out" },
  { key: "drivers", label: "Drivers", hint: "Connect your apps and scripts to Exasol" },
  { key: "extension", label: "Extensions", hint: "Extend what Exasol can store and query" },
  { key: "vs", label: "Virtual Schemas", hint: "Query other databases and files as if they were Exasol tables" },
  { key: "ai", label: "AI & Agents", hint: "MCP, agent skills, LLM workflows" },
  { key: "bi", label: "BI & Analytics", hint: "Dashboards and visual analytics" },
  { key: "library", label: "Libraries & tooling", hint: "Published libraries, plugins and test tooling for building on Exasol" },
];
export function sectionOf(kind: Kind): SectionKey {
  switch (kind) {
    case "database":
    case "cloud":
      return "database";
    case "cli":
      return "load";
    case "driver":
      return "drivers";
    case "extension":
      return "extension";
    case "server":
    case "skills":
      return "ai";
    case "bi":
      return "bi";
    case "vs":
      return "vs";
    case "library":
      return "library";
  }
}
export function sectionLabel(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.label ?? key;
}

/** Docker Hub's "Trusted content" rail, in Exasol terms. */
export type Trust = "official" | "labs" | "installed";
export const TRUST: { key: Trust; label: string }[] = [
  { key: "official", label: "Official Exasol" },
  { key: "labs", label: "Exasol Labs" },
  { key: "installed", label: "Installed" },
];

export type HubFilters = { trust: Set<Trust>; sections: Set<SectionKey> };
export type Sort = "suggested" | "name" | "updated";
export const SORTS: { key: Sort; label: string }[] = [
  { key: "suggested", label: "Suggested" },
  { key: "name", label: "Name A–Z" },
  { key: "updated", label: "Recently updated" },
];

export const emptyFilters = (): HubFilters => ({ trust: new Set(), sections: new Set() });
export function filterCount(f: HubFilters): number {
  return f.trust.size + f.sections.size;
}

const INSTALLED_KINDS = new Set<ItemState["kind"]>(["installed", "update", "running", "ready", "onSystem"]);

/**
 * Query → trust → category → sort. Within one rail the boxes OR together
 * (Official + Labs = both); across rails they AND (Official AND Drivers).
 * "Suggested" keeps catalog order (curated) unless a query ranks by relevance.
 */
export function applyFilters(
  items: ResolvedCatalogItem[],
  stateOf: (item: ResolvedCatalogItem) => ItemState,
  query: string,
  filters: HubFilters,
  sort: Sort,
): ResolvedCatalogItem[] {
  const q = query.trim();
  let list = q ? fuzzyRank(q, items, (i) => `${i.name} ${i.id} ${i.repo ?? ""} ${i.kind} ${i.description}`).map((r) => r.item) : items;
  if (filters.trust.size) {
    list = list.filter((i) => {
      const s = stateOf(i);
      return (
        (filters.trust.has("official") && !i.labs) ||
        (filters.trust.has("labs") && Boolean(i.labs)) ||
        (filters.trust.has("installed") && INSTALLED_KINDS.has(s.kind))
      );
    });
  }
  if (filters.sections.size) list = list.filter((i) => filters.sections.has(sectionOf(i.kind)));
  if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "updated") list = [...list].sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  return list;
}

/** The removable chips under the search box, in rail order. */
export function activeChips(f: HubFilters): { key: string; label: string; remove: (f: HubFilters) => HubFilters }[] {
  const chips: { key: string; label: string; remove: (f: HubFilters) => HubFilters }[] = [];
  for (const t of TRUST) {
    if (f.trust.has(t.key)) {
      chips.push({ key: `trust:${t.key}`, label: t.label, remove: (g) => ({ ...g, trust: without(g.trust, t.key) }) });
    }
  }
  for (const s of SECTIONS) {
    if (f.sections.has(s.key)) {
      chips.push({ key: `section:${s.key}`, label: s.label, remove: (g) => ({ ...g, sections: without(g.sections, s.key) }) });
    }
  }
  return chips;
}
function without<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  next.delete(v);
  return next;
}

/** "1 - 24 of 2500 results" */
export function resultRange(shown: number, total: number): string {
  if (total === 0) return "0 results";
  return `1 - ${Math.min(shown, total)} of ${total} result${total === 1 ? "" : "s"}`;
}

/** Compact counts the way Docker Hub writes them: 1.6K, 100K+, 10M+. */
export function compactCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K${n % 1000 ? "+" : ""}`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "updated 3 days ago" — coarse on purpose; a card is not a changelog. */
export function relativeAge(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}
