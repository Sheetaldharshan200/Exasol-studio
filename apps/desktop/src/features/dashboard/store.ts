// Dashboard persistence — the pure (de)serialization and migration layer.
//
// Rust owns the actual file I/O (one `dashboards/<id>.json` per dashboard under
// the app data dir); this module owns the SHAPE that gets written and read, plus
// the last-result cache that lets a dashboard paint instantly on reopen before
// any query re-runs. Kept pure so the round-trip is unit-tested without touching
// the filesystem, and forward-compatible so a file written by a newer build still
// loads (unknown fields are preserved, never dropped).

import type { DashboardDoc } from "./model.ts";

export const DASHBOARD_FILE_VERSION = 1;

/** A widget's last successful result, cached so reopen shows data immediately. */
export type CachedResult = {
  columns?: string[];
  rows?: unknown[][];
  /** Non-tabular widgets (kpi, markdown) may cache an arbitrary value. */
  value?: unknown;
  lastRefreshed?: string; // ISO timestamp, stamped by the caller (never here)
  error?: string;
};

/** Per-dashboard and per-widget refresh configuration. */
export type RefreshConfig = {
  enabled: boolean;
  intervalSec: number;
  /** Per-widget overrides: interval, or 0/false to opt a widget out. */
  perWidget?: Record<string, { enabled?: boolean; intervalSec?: number }>;
};

/** The on-disk shape. `extra` carries through any field a newer build added. */
export type DashboardFile = {
  version: number;
  doc: DashboardDoc;
  cache: Record<string, CachedResult>;
  refresh: RefreshConfig;
};

export const DEFAULT_REFRESH: RefreshConfig = { enabled: false, intervalSec: 60 };

/** Serialize a dashboard file to the JSON string Rust writes to disk. */
export function serialize(file: DashboardFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Parse a dashboard file, tolerating older/newer/partial inputs: a missing cache
 * or refresh block becomes the default, and any unknown top-level fields are
 * preserved so a file written by a newer build round-trips without loss.
 */
export function parse(raw: string): DashboardFile {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("dashboard file is not valid JSON");
  }
  const doc = obj.doc as DashboardDoc | undefined;
  if (!doc || typeof doc !== "object" || !Array.isArray((doc as DashboardDoc).widgets)) {
    throw new Error("dashboard file has no valid document");
  }
  const { version, doc: _d, cache, refresh, ...extra } = obj;
  return {
    ...extra, // preserve unknown future fields
    version: typeof version === "number" ? version : DASHBOARD_FILE_VERSION,
    doc,
    cache: (cache as Record<string, CachedResult>) ?? {},
    refresh: normalizeRefresh(refresh),
  };
}

function normalizeRefresh(r: unknown): RefreshConfig {
  const o = (r ?? {}) as Partial<RefreshConfig>;
  const intervalSec = typeof o.intervalSec === "number" && o.intervalSec > 0 ? o.intervalSec : DEFAULT_REFRESH.intervalSec;
  const out: RefreshConfig = { enabled: Boolean(o.enabled), intervalSec };
  if (o.perWidget) out.perWidget = o.perWidget; // omit when absent so the shape matches the default
  return out;
}

/** A fresh file wrapping a new document. */
export function newFile(doc: DashboardDoc): DashboardFile {
  return { version: DASHBOARD_FILE_VERSION, doc, cache: {}, refresh: { ...DEFAULT_REFRESH } };
}

/**
 * Store a widget's result in the cache (pure — returns a new file). The caller
 * supplies the timestamp so this stays deterministic and clock-free.
 */
export function cacheResult(file: DashboardFile, widgetId: string, result: CachedResult): DashboardFile {
  return { ...file, cache: { ...file.cache, [widgetId]: result } };
}

/** Drop cache entries for widgets that no longer exist in the document. */
export function pruneCache(file: DashboardFile): DashboardFile {
  const live = new Set(file.doc.widgets.map((w) => w.id));
  const cache: Record<string, CachedResult> = {};
  for (const [id, r] of Object.entries(file.cache)) if (live.has(id)) cache[id] = r;
  return { ...file, cache };
}
