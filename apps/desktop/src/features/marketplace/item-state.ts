import { CATALOG_TO_COMPONENT, isNewerVersion } from "./updates.ts";
import type { InstalledItem, ReleaseAsset, MarketEnv } from "@/lib/ipc";
import type { ResolvedCatalogItem } from "./catalog-data.ts";
import { pickAsset } from "./assets.ts";

/**
 * What one catalog item IS right now — the single decision the card, the
 * detail page, the Updates page and the badge all read. It used to be ten
 * booleans derived inline in the card, and the three surfaces disagreed.
 */
export type ItemState =
  /** The managed local database, and it is up. */
  | { kind: "running"; installed: string | null; available: string | null }
  | { kind: "installed"; installed: string | null; available: string | null; where?: string }
  /** Installed and a strictly newer release exists. */
  | { kind: "update"; installed: string; available: string }
  /** Found on the machine outside Studio's management. */
  | { kind: "onSystem" }
  /** Runs inside Studio, and its runtime is ready. */
  | { kind: "ready"; installed: string | null }
  | { kind: "installing" }
  /** A binary release with no build for this host. */
  | { kind: "unavailable"; platform: string }
  /** Documentation-hosted: nothing to install, only a link. */
  | { kind: "reference" }
  | { kind: "install"; available: string | null };

export type ItemSources = {
  /**
   * What is REALLY installed, by catalog id. For managed components this map
   * is built from detection + `list_components` (Marketplace's `installedMap`):
   * `list_components` alone reports a verified fallback even when nothing is
   * installed, so it is never consulted for presence here.
   */
  installed: Record<string, InstalledItem>;
  componentUpstream: Record<string, string>;
  detected: Record<string, boolean>;
  installing: Set<string>;
  /** Newest known version for addons (release tag, else catalog latest). */
  latestFor: (id: string) => string | null;
  releaseAssets: (id: string) => ReleaseAsset[];
  env: MarketEnv | null;
  /** Runs-inside-Studio driver runtime readiness, by driver id. */
  driverRuntime?: { id: string; ready: boolean; busy: boolean };
};

export type ItemLike = Pick<ResolvedCatalogItem, "id" | "install">;

export function itemState(item: ItemLike, s: ItemSources): ItemState {
  if (s.installing.has(item.id) || s.driverRuntime?.busy) return { kind: "installing" };
  if (item.install === "reference") return { kind: "reference" };

  const managedId = CATALOG_TO_COMPONENT[item.id];
  const inst = s.installed[item.id];
  // Managed components compare against the live upstream tag; addons against
  // the newest known release. Both are "strictly newer", never a downgrade.
  const available = inst ? (managedId ? (s.componentUpstream[managedId] ?? null) : s.latestFor(item.id)) : null;
  // An available update outranks every other installed state — including a
  // driver runtime that is ready — so the Updates page and the item page agree.
  if (inst && available && isNewerVersion(available, inst.version)) return { kind: "update", installed: inst.version, available };

  if (s.driverRuntime) {
    if (s.driverRuntime.ready) return { kind: "ready", installed: inst?.version ?? null };
    return { kind: "install", available: s.latestFor(item.id) };
  }

  if (inst) {
    if (item.id === "exasol-personal" && s.detected["exasol-personal:running"]) return { kind: "running", installed: inst.version ?? null, available };
    const where = item.id === "semantic-views" && inst.note?.includes(" in ") ? inst.note.split(" in ").pop()?.replace(/\.$/, "") : undefined;
    return { kind: "installed", installed: inst.version ?? null, available, where };
  }
  if (s.detected[item.id]) {
    if (item.id === "exasol-personal" && s.detected["exasol-personal:running"]) return { kind: "running", installed: null, available: null };
    return { kind: "onSystem" };
  }
  const assets = s.releaseAssets(item.id);
  if (item.install === "binary" && assets.length > 0 && pickAsset(assets, s.env) === null) {
    return { kind: "unavailable", platform: s.env?.os === "macos" ? "macOS" : (s.env?.os ?? "this platform") };
  }
  return { kind: "install", available: s.latestFor(item.id) };
}

/** The one number the header, the badge and the Updates page all show. */
export function countUpdates(items: ItemLike[], s: ItemSources): number {
  return items.filter((i) => itemState(i, s).kind === "update").length;
}

/** Docker-Hub-style footer: the one fact worth a glance. */
export function stateLabel(state: ItemState): string {
  switch (state.kind) {
    case "running":
      return "Running";
    case "installed":
      return state.where ? `Installed in ${state.where}` : state.installed ? `Installed · ${state.installed}` : "Installed";
    case "update":
      return `Update ${state.available}`;
    case "onSystem":
      return "On this system";
    case "ready":
      return "Ready to use";
    case "installing":
      return "Installing…";
    case "unavailable":
      return `No ${state.platform} build`;
    case "reference":
      return "Docs";
    case "install":
      return state.available ? `Install ${state.available}` : "Install";
  }
}
