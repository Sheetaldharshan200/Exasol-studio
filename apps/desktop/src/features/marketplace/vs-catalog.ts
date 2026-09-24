/**
 * The Virtual Schemas shelf.
 *
 * A virtual schema adapter is a marketplace item like any other — it has a
 * repository, a release, and something to install — but it installs into the
 * CONNECTED DATABASE's BucketFS rather than onto this machine, which is why it
 * gets its own kind and its own shelf.
 *
 * Nothing here is a list. The entries are derived from the adapter registry
 * that the add-data-source flow already uses, so an adapter added there
 * appears here with no second edit, and the two can never disagree about which
 * adapters exist or where their artifacts come from.
 */
import { VS_ADAPTERS } from "../connection/virtual-schemas/adapters/index.ts";
import type { VsAdapter } from "../connection/virtual-schemas/types.ts";
import type { CatalogItem } from "./catalog-data.ts";

/** Catalog id for an adapter — prefixed so it cannot collide with an addon. */
export const vsItemId = (adapterId: string): string => `vs-${adapterId}`;

/**
 * One catalog item per adapter.
 *
 * A Lua adapter has no artifact to stage — its source is inlined into the
 * `CREATE ADAPTER SCRIPT` when a schema is attached — so there is nothing to
 * update and it links to its guide instead.
 */
export const VS_CATALOG: CatalogItem[] = VS_ADAPTERS.map((a) => ({
  id: vsItemId(a.id),
  repo: a.repo,
  kind: "vs" as const,
  install: a.runtime === "lua" ? ("reference" as const) : ("vs-adapter" as const),
}));

/** The adapter behind a catalog id, or undefined for any other item. */
export function vsAdapterFor(itemId: string): VsAdapter | undefined {
  return VS_ADAPTERS.find((a) => vsItemId(a.id) === itemId);
}
