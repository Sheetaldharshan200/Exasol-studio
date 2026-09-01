// Compact, AI-facing rendering of a measured Exasol profile — pure and
// tested. The raw profile window covers EVERY statement since the baseline
// (including Studio's own catalog/profiling queries) with a dozen columns;
// sending all of that to the AI buries the signal. This module scopes to one
// statement and emits a minimal table: only columns that carry data, rows
// capped, durations in milliseconds.

export type PlanRecord = Record<string, unknown>;

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** The rows of the statement that did the real work: group by STMT_ID and
 *  keep the group with the largest summed DURATION. Internal helper
 *  statements (DUAL probes, catalog reads) lose to any real query. */
export function heaviestStatement(records: PlanRecord[]): PlanRecord[] {
  const groups = new Map<string, PlanRecord[]>();
  for (const r of records) {
    const id = str(r.STMT_ID);
    const g = groups.get(id);
    if (g) g.push(r);
    else groups.set(id, [r]);
  }
  let best: PlanRecord[] = [];
  let bestDur = -1;
  for (const g of groups.values()) {
    const d = g.reduce((n, r) => n + num(r.DURATION), 0);
    if (d > bestDur) {
      bestDur = d;
      best = g;
    }
  }
  return best;
}

/** DURATION arrives in seconds; the AI reads milliseconds more naturally. */
function ms(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const m = num(v) * 1000;
  return m >= 10 ? String(Math.round(m)) : String(Math.round(m * 100) / 100);
}

const MAX_PARTS = 25;

/** One statement's plan as a minimal pipe table. Columns that are empty on
 *  every row are dropped; parts beyond the cap are summarized, not sent. */
export function buildPlanBlock(records: PlanRecord[], source: string): string {
  if (records.length === 0) return "";
  const shown = records.slice(0, MAX_PARTS);
  const cols: { h: string; of: (r: PlanRecord) => string }[] = [
    { h: "part", of: (r) => str(r.PART_NAME) },
    { h: "info", of: (r) => str(r.PART_INFO) },
    { h: "object", of: (r) => [str(r.OBJECT_SCHEMA), str(r.OBJECT_NAME)].filter(Boolean).join(".") },
    { h: "obj_rows", of: (r) => str(r.OBJECT_ROWS) },
    { h: "in", of: (r) => str(r.IN_ROWS) },
    { h: "out", of: (r) => str(r.OUT_ROWS) },
    { h: "ms", of: (r) => ms(r.DURATION) },
    { h: "notes", of: (r) => str(r.REMARKS) },
  ];
  const live = cols.filter((c) => shown.some((r) => c.of(r) !== ""));
  if (live.length === 0) return "";
  const lines = shown.map((r) => live.map((c) => c.of(r)).join(" | "));
  const extra = records.length > shown.length ? `\n(+${records.length - shown.length} more parts omitted)` : "";
  return `\n\nMeasured plan (${source}, this run; durations in ms):\n${live.map((c) => c.h).join(" | ")}\n${lines.join("\n")}${extra}`;
}
