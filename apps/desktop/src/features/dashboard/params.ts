// Parameter binding — the one mechanism behind filters, search, cross-filtering,
// and drill-down. A widget query references a dashboard parameter as `:name`;
// binding substitutes the parameter's current value as a SQL literal and reports
// which parameters the query depends on, so the refresh scheduler knows exactly
// which widgets a parameter change invalidates.
//
// Pure and framework-free so it is unit-tested in isolation and so the desktop
// splitter and the engine agree on what a bound query is.

import type { Param } from "./model.ts";

export type BindResult = {
  /** The query with every resolved `:name` replaced by a SQL literal. */
  sql: string;
  /** Canonical names of the parameters this query references (deduped). */
  used: string[];
  /** Referenced `:name`s that have no matching parameter (left in place). */
  missing: string[];
};

// A `:name` placeholder: a colon that is NOT part of `::` and not glued to a
// preceding word char, followed by an identifier. Exasol has no `::` cast, so a
// lone leading colon is unambiguous here.
const PLACEHOLDER = /(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)/g;

/** Exasol folds unquoted identifiers to upper case; match parameter names the same way. */
const fold = (s: string): string => s.toUpperCase();

/** Render one JS value as a SQL literal. */
export function toSqlLiteral(value: unknown, type?: Param["type"]): string {
  if (value === null || value === undefined || value === "") return "NULL";
  if (type === "number" || typeof value === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? String(n) : "NULL";
  }
  // text / select / date and everything else → quoted string with '' escaping.
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Substitute the given parameters into a query. Unknown placeholders are left
 * untouched and reported in `missing` so the query fails loudly rather than
 * silently binding NULL. Matching is case-insensitive (Exasol identifier
 * folding), and each parameter is looked up once.
 */
export function bindParams(query: string, params: Param[]): BindResult {
  const byName = new Map<string, Param>();
  for (const p of params) byName.set(fold(p.name), p);

  const used = new Set<string>();
  const missing = new Set<string>();

  const sql = query.replace(PLACEHOLDER, (whole, name: string) => {
    const p = byName.get(fold(name));
    if (!p) {
      missing.add(name);
      return whole; // leave `:name` as-is
    }
    used.add(p.name);
    const v = p.value ?? p.default ?? null;
    return toSqlLiteral(v, p.type);
  });

  return { sql, used: [...used], missing: [...missing] };
}
