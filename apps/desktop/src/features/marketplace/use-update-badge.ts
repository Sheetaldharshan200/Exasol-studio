// Background Marketplace-update poller. Independent of whether the Marketplace
// panel is open: it periodically reads the SAME catalog source the Updates tab
// uses (the catalog.json mirror + per-repo upstream tags) and raises a
// studio:notice badge when the number of available updates goes UP — so the
// user learns about updates without opening the tab. Notifies only on a rise
// (persisted "seen" count), so it never nags.

import { useEffect } from "react";
import { ipc } from "@/lib/ipc";
import { CATALOG } from "@/features/marketplace/catalog-data";
import { countCatalogUpdates, countManagedUpdates } from "@/features/marketplace/updates";

const SEEN_KEY = "exa.market.updatesSeen";
const FIRST_DELAY_MS = 8_000; // shortly after launch, once the app has settled
const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function currentUpdateCount(): Promise<number> {
  const [catalog, installed, comps, upstreamList] = await Promise.all([
    ipc.marketCatalog().catch(() => null),
    ipc.marketInstalled().catch(() => []),
    ipc.listComponents().catch(() => []),
    ipc.componentsUpstream().catch(() => []),
  ]);
  const upstream = Object.fromEntries(upstreamList.map((u) => [u.id, u.tag]));
  const catalogIds = CATALOG.map((c) => c.id);
  return countCatalogUpdates(catalog, installed, catalogIds) + countManagedUpdates(comps, upstream);
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
    const iv = window.setInterval(() => void check(), INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, []);
}
