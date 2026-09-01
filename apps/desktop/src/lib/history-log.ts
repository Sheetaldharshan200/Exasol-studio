// Pure sort/filter logic for the SQL History execution log — extracted from
// HistoryDock so ordering is unit-testable (the table's ordering was reported
// broken twice; a tested comparator settles it).

import type { HistoryEntry } from "@/lib/ipc";

export type LogSortKey = "time" | "status" | "command" | "exec" | "fetch" | "rows" | "message" | "sql";

/** Leading SQL verb ("SELECT", "CREATE", …); "SQL" when the text starts with
 *  something else (a comment, a paren). */
export function verbOf(e: Pick<HistoryEntry, "sql">): string {
  return (e.sql.trim().match(/^[a-zA-Z]+/)?.[0] ?? "SQL").toUpperCase();
}

/** Epoch millis for ordering — numeric, so mixed ISO shapes ("…Z" vs
 *  "…+00:00", varying fraction lengths) can never misorder the way raw string
 *  comparison could. Unparseable dates sort oldest. */
function timeOf(e: Pick<HistoryEntry, "executedAt">): number {
  const t = Date.parse(e.executedAt);
  return Number.isNaN(t) ? 0 : t;
}

function sortVal(e: HistoryEntry, key: LogSortKey): string | number {
  switch (key) {
    case "time": return timeOf(e);
    case "status": return e.success ? 1 : 0;
    case "command": return verbOf(e);
    case "exec": return e.execMs ?? e.elapsedMs;
    case "fetch": return e.fetchMs ?? -1;
    case "rows": return e.rowCount;
    case "message": return e.error ?? "";
    case "sql": return e.sql;
  }
}

export type KeyedEntry = { e: HistoryEntry; k: string };

/** Stable render keys: entries persisted before ids carried a sequence number
 *  can SHARE an id (same-millisecond runs), and duplicate React keys duplicate
 *  rows once a sort reorders them. The original list position disambiguates
 *  and never changes with the sort. */
export function keyEntries(entries: HistoryEntry[]): KeyedEntry[] {
  return entries.map((e, i) => ({ e, k: `${e.id}#${i}` }));
}

/** Value filters (empty set = everything passes). */
export function filterEntries(
  keyed: KeyedEntry[],
  statusFilter: ReadonlySet<string>,
  commandFilter: ReadonlySet<string>,
): KeyedEntry[] {
  return keyed.filter(
    ({ e }) =>
      (statusFilter.size === 0 || statusFilter.has(e.success ? "Success" : "Failed")) &&
      (commandFilter.size === 0 || commandFilter.has(verbOf(e))),
  );
}

/** Sort by `key`/`dir` with deterministic tie-breaks: equal primary values
 *  fall back to newest-first, then original position — so ties never shuffle
 *  and equal-valued columns still show a meaningful order. */
export function sortEntries(keyed: KeyedEntry[], key: LogSortKey, dir: 1 | -1): KeyedEntry[] {
  return [...keyed].sort((a, b) => {
    const va = sortVal(a.e, key);
    const vb = sortVal(b.e, key);
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    if (cmp !== 0) return cmp * dir;
    const t = timeOf(b.e) - timeOf(a.e); // ties: newest first, regardless of dir
    if (t !== 0) return t;
    return a.k.localeCompare(b.k);
  });
}
