// App-open Marketplace-update check. Runs ONCE shortly after launch (no
// background polling — user rule: updates are fetched only on app open and on
// clicking the Updates/catalog tabs). Reads the SAME catalog source the
// Updates tab uses (the catalog.json mirror + per-repo upstream tags) and
// raises a studio:notice badge when the number of available updates went UP
// since last seen — so the user learns about updates without opening the tab.

import { useEffect } from "react";
import { ipc } from "@/lib/ipc";
import { CATALOG } from "@/features/marketplace/catalog-data";
import { CATALOG_TO_COMPONENT } from "@/features/marketplace/updates";
import { countUpdates } from "@/features/marketplace/item-state";
import type { InstalledItem } from "@/lib/ipc";

const SEEN_KEY = "exa.market.updatesSeen";
const FIRST_DELAY_MS = 8_000; // shortly after launch, once the app has settled

async function currentUpdateCount(): Promise<number> {
  const [catalog, installed, detected, comps, upstreamList] = await Promise.all([
    ipc.marketCatalog().catch(() => null),
    ipc.marketInstalled().catch(() => []),
    ipc.marketDetect().catch(() => ({}) as Record<string, boolean>),
    ipc.listComponents().catch(() => []),
    ipc.componentsUpstream().catch(() => []),
  ]);
  // The same installedMap the Marketplace builds: addons from the manifest,
  // managed components only when detected AND versioned by list_components.
  const installedMap: Record<string, InstalledItem> = {};
  for (const i of installed) installedMap[i.id] = i;
  for (const [catalogId, compId] of Object.entries(CATALOG_TO_COMPONENT)) {
    const comp = comps.find((c) => c.id === compId);
    if (comp && detected[catalogId] && comp.installed) installedMap[catalogId] = { id: catalogId, version: comp.installed, path: "", filename: "" };
    else delete installedMap[catalogId];
  }
  return countUpdates(CATALOG, {
    installed: installedMap,
    componentUpstream: Object.fromEntries(upstreamList.map((u) => [u.id, u.tag])),
    detected,
    installing: new Set(),
    latestFor: (id) => catalog?.items?.[id]?.latest ?? null,
    releaseAssets: () => [],
    env: null,
  });
}

export function useMarketplaceUpdateBadge(): void {
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const total = await currentUpdateCount();
        if (cancelled) return;
        const seen = Number(localStorage.getItem(SEEN_KEY) ?? "0") || 0;
        if (total > seen && total > 0) {
          window.dispatchEvent(
            new CustomEvent("studio:notice", {
              detail: {
                kind: "info",
                title: "Updates available",
                body: `${total} component update${total === 1 ? "" : "s"} ready in the Marketplace.`,
                go: "marketplace",
              },
            }),
          );
        }
        // Track the latest observed count either way (a drop after updating keeps
        // future rises noticeable without re-announcing the same set).
        localStorage.setItem(SEEN_KEY, String(total));
      } catch {
        /* offline / rate-limited — try again next interval */
      }
    };
    const first = window.setTimeout(() => void check(), FIRST_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, []);
}
