// How a running thing tells its time: the wall clock it started at and how
// long it has been going. One vocabulary for the SQL results strip, the
// visualizer's schema loading, the query builder preview and the add-source
// steps — so "is anything happening?" always reads the same way.

/** `0.4s`, `12.3s`, `1m 05s`, `1h 02m` — short enough for a tab strip. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** The local wall-clock time of `ts`, `14:05:12`. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}
