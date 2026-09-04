// The shared query path for data-backed widgets. A widget's query is bound with
// the dashboard's current parameters and run through the app's executeSql; it
// re-runs when the BOUND sql (or connection) changes, and — when live refresh is
// on for the widget — on an interval. A failed run KEEPS the last successful
// result and surfaces the error, so a refreshing dashboard never blanks out on a
// transient failure. Internal, so split=false and addHistory=false (dashboard
// refreshes must not spam SQL History).

import { useEffect, useRef, useState } from "react";
import { ipc, type StatementResult } from "@/lib/ipc";
import { bindParams } from "./params";
import { applyCrossFilters, useCrossFilters } from "./cross-filter";
import { drillSql } from "./drill-sql";
import { useDrill } from "./drill-store";
import { effectiveIntervalMs } from "./refresh";
import type { RefreshConfig } from "./store";
import type { DashboardDoc, Widget } from "./model";

export type WidgetData = { result?: StatementResult; loading: boolean; error?: string; lastRefreshed?: number };
export type DashConn = { profileId: string; connectionName: string } | null;

const MAX_ROWS = 10000;

export function useWidgetData(
  widget: Widget,
  doc: DashboardDoc,
  conn: DashConn,
  seed?: StatementResult,
  refreshConfig?: RefreshConfig,
): WidgetData {
  const [data, setData] = useState<WidgetData>(seed ? { result: seed, loading: false } : { loading: Boolean(widget.query) });

  const bound = widget.query ? bindParams(widget.query, doc.params) : null;
  const sql = bound?.sql ?? "";
  const missing = bound?.missing ?? [];
  const refreshMs = effectiveIntervalMs(widget.id, refreshConfig);
  // Drill-down: when configured (props.drill + props.measure), re-aggregate the
  // query at the current drill level before anything else.
  const drill = (widget.props?.drill as string[] | undefined) ?? [];
  const measure = widget.props?.measure as string | undefined;
  const drillState = useDrill(widget.id);
  const drilledSql = drill.length && measure ? drillSql(sql, drill, measure, drillState) : sql;
  // Cross-filters: wrap the query so a click on another chart filters this one
  // (but not the chart that set it). Errors (e.g. a filter column not in this
  // query) fall back to the base query, so a click never breaks a widget.
  const cf = useCrossFilters();
  const filteredSql = applyCrossFilters(drilledSql, cf, widget.id);
  const key = `${widget.id} ${filteredSql} ${conn?.profileId ?? ""} ${conn?.connectionName ?? ""}`;

  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    if (!widget.query || !conn || missing.length) return;
    setData((d) => ({ ...d, loading: !d.result, error: undefined })); // keep showing data while refreshing
    const run = (q: string, allowFallback: boolean): void => {
      ipc
        .executeSql(conn.profileId, conn.connectionName, q, MAX_ROWS, false, false)
        .then((resp) => {
          const r = resp.results?.[0];
          if (r && !r.error) return setData({ result: r, loading: false, lastRefreshed: Date.now() });
          // A cross-filter that doesn't apply to this query → run the (drilled) base.
          if (allowFallback && q !== drilledSql) return run(drilledSql, false);
          if (!r) return setData((d) => ({ result: d.result, loading: false, error: "No result returned", lastRefreshed: d.lastRefreshed }));
          setData((d) => ({ result: d.result, loading: false, error: r.error ?? "error", lastRefreshed: d.lastRefreshed }));
        })
        .catch((e) => {
          if (allowFallback && q !== drilledSql) return run(drilledSql, false);
          setData((d) => ({ result: d.result, loading: false, error: e instanceof Error ? e.message : String(e), lastRefreshed: d.lastRefreshed }));
        });
    };
    run(filteredSql, true);
  };

  // Initial fetch + re-fetch whenever the bound sql or connection changes.
  useEffect(() => {
    if (!widget.query) {
      setData({ loading: false });
      return;
    }
    if (!conn) {
      setData((d) => ({ result: d.result, loading: false, error: "No connection" }));
      return;
    }
    if (missing.length) {
      setData((d) => ({ result: d.result, loading: false, error: `Unknown parameter: ${missing.join(", ")}` }));
      return;
    }
    runRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Periodic refresh when enabled for this widget.
  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => runRef.current(), refreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs, key]);

  return data;
}
