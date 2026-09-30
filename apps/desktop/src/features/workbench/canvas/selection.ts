// What a chart selection means in rows: pure, so it can be tested without ECharts.

import type { StatementResult } from "@/lib/ipc";
import type { Selection } from "./store.ts";

/**
 * What was selected, as values of the `by` column. ECharts reports data
 * indices; where the drawn series carries names (pie, funnel — which are
 * sorted, so an index no longer points at the same row) the name is the
 * value, otherwise the index reads the row. Field names match the catalog
 * case-insensitively, as the chart builder does.
 */
export function selectionValues(result: StatementResult, field: string | undefined, picks: { dataIndex: number; name?: string }[]): Selection | null {
  const wanted = (field ?? result.columns[0]?.name ?? "").toLowerCase();
  const col = result.columns.findIndex((c) => c.name.toLowerCase() === wanted);
  if (col < 0) return null;
  const values = picks.map((p) => (p.name !== undefined ? p.name : result.rows[p.dataIndex]?.[col])).filter((v, i, arr) => arr.indexOf(v) === i);
  return { field: result.columns[col]!.name, values };
}

/** The picks behind an ECharts `selectchanged` event, with names where the series has them. */
export function picksFrom(selected: { seriesIndex: number; dataIndex: number[] }[], seriesData: (unknown[] | undefined)[]): { dataIndex: number; name?: string }[] {
  const out: { dataIndex: number; name?: string }[] = [];
  for (const s of selected) {
    const data = seriesData[s.seriesIndex];
    for (const i of s.dataIndex) {
      const item = data?.[i] as { name?: unknown } | undefined;
      out.push(item && typeof item === "object" && "name" in item && item.name !== undefined ? { dataIndex: i, name: String(item.name) } : { dataIndex: i });
    }
  }
  return out;
}
