import type { Dashboard } from "@/lib/agent-client";

// The built-in System dashboards — code is the source of truth; the notebook's
// System button regenerates them on every open. The server-side copies (saved
// with group "System") are read-only by DashboardStore.

/** Issue #10: a one-click query-efficiency dashboard on Exasol's own
 * statistics tables (EXA_STATISTICS.EXA_SQL_LAST_DAY) — statement volume,
 * durations by command, error rate, resource hogs. */
export function queryPerfDashboard(): Dashboard {
  const S = "EXA_STATISTICS.EXA_SQL_LAST_DAY";
  return {
    version: 1,
    id: "",
    title: "Query performance",
    description: "Engine efficiency from Exasol's statistics tables (last 24h)",
    group: "System",
    refreshMs: 60_000,
    panels: [
      { id: "qp-note", title: "About", grid: { x: 0, y: 0, w: 12, h: 2 }, viz: { type: "markdown", content: "**Query performance — last 24 hours** (from `EXA_STATISTICS.EXA_SQL_LAST_DAY`, auto-refreshes every minute). Volume and latency per command, failures, and the heaviest statements by duration, CPU and temp RAM." } },
      { id: "qp-count", title: "Statements (24h)", grid: { x: 0, y: 2, w: 3, h: 4 }, query: { sql: `SELECT COUNT(*) AS STATEMENTS FROM ${S}` }, viz: { type: "kpi" } },
      { id: "qp-err", title: "Failed %", grid: { x: 3, y: 2, w: 3, h: 4 }, query: { sql: `SELECT ROUND(100 * SUM(CASE WHEN SUCCESS THEN 0 ELSE 1 END) / NULLIF(COUNT(*), 0), 2) AS FAILED_PCT FROM ${S}` }, viz: { type: "kpi", unit: "%" } },
      { id: "qp-avg", title: "Avg duration (s)", grid: { x: 6, y: 2, w: 3, h: 4 }, query: { sql: `SELECT ROUND(AVG(DURATION), 3) AS AVG_SECONDS FROM ${S}` }, viz: { type: "kpi", unit: "s" } },
      { id: "qp-p95", title: "Max duration (s)", grid: { x: 9, y: 2, w: 3, h: 4 }, query: { sql: `SELECT ROUND(MAX(DURATION), 2) AS MAX_SECONDS FROM ${S}` }, viz: { type: "kpi", unit: "s" } },
      { id: "qp-hourly", title: "Statements per hour", grid: { x: 0, y: 6, w: 6, h: 7 }, query: { sql: `SELECT TO_CHAR(TRUNC(START_TIME, 'HH'), 'HH24:MI') AS HOUR_OF_DAY, COUNT(*) AS STATEMENTS FROM ${S} GROUP BY TRUNC(START_TIME, 'HH') ORDER BY TRUNC(START_TIME, 'HH')` }, viz: { type: "echarts", chart: "area" } },
      { id: "qp-bycmd", title: "Avg duration by command", grid: { x: 6, y: 6, w: 6, h: 7 }, query: { sql: `SELECT COMMAND_NAME, ROUND(AVG(DURATION), 3) AS AVG_SECONDS FROM ${S} GROUP BY COMMAND_NAME ORDER BY 2 DESC LIMIT 14` }, viz: { type: "echarts", chart: "hbar" } },
      { id: "qp-classvol", title: "Volume by command class", grid: { x: 0, y: 13, w: 6, h: 7 }, query: { sql: `SELECT COMMAND_CLASS, COUNT(*) AS STATEMENTS FROM ${S} GROUP BY COMMAND_CLASS ORDER BY 2 DESC` }, viz: { type: "echarts", chart: "donut" } },
      { id: "qp-cpu", title: "Duration vs CPU (per statement)", grid: { x: 6, y: 13, w: 6, h: 7 }, query: { sql: `SELECT DURATION AS DURATION_S, CPU FROM ${S} WHERE DURATION IS NOT NULL AND CPU IS NOT NULL ORDER BY DURATION DESC LIMIT 500` }, viz: { type: "echarts", chart: "scatter" } },
      { id: "qp-slowest", title: "Heaviest statements", grid: { x: 0, y: 20, w: 12, h: 8 }, query: { sql: `SELECT TO_CHAR(START_TIME, 'HH24:MI:SS') AS LOGGED_AT, SESSION_ID, COMMAND_NAME, ROUND(DURATION, 2) AS SECONDS, ROUND(CPU, 1) AS CPU, ROUND(TEMP_DB_RAM_PEAK, 1) AS TEMP_RAM_MIB, ROW_COUNT, CASE WHEN SUCCESS THEN 'ok' ELSE 'FAILED' END AS STATUS FROM ${S} ORDER BY DURATION DESC LIMIT 100` }, viz: { type: "table" } },
    ],
  };
}

/** System dashboard: who is on the database right now. */
export function sessionsDashboard(): Dashboard {
  return {
    version: 1,
    id: "",
    title: "Sessions & activity",
    description: "Live sessions and what they are doing",
    group: "System",
    refreshMs: 30_000,
    panels: [
      { id: "ss-count", title: "Active sessions", grid: { x: 0, y: 0, w: 4, h: 4 }, query: { sql: "SELECT COUNT(*) AS SESSIONS FROM SYS.EXA_ALL_SESSIONS" }, viz: { type: "kpi" } },
      { id: "ss-users", title: "Sessions by user", grid: { x: 4, y: 0, w: 8, h: 6 }, query: { sql: "SELECT USER_NAME, COUNT(*) AS SESSIONS FROM SYS.EXA_ALL_SESSIONS GROUP BY USER_NAME ORDER BY 2 DESC" }, viz: { type: "echarts", chart: "hbar" } },
      { id: "ss-table", title: "Session detail", grid: { x: 0, y: 6, w: 12, h: 8 }, query: { sql: "SELECT SESSION_ID, USER_NAME, STATUS, COMMAND_NAME, DURATION, CLIENT, LOGIN_TIME FROM SYS.EXA_ALL_SESSIONS ORDER BY LOGIN_TIME DESC" }, viz: { type: "table" } },
    ],
  };
}

/** System dashboard: database size over time. */
export function dbSizeDashboard(): Dashboard {
  const S = "EXA_STATISTICS.EXA_DB_SIZE_LAST_DAY";
  return {
    version: 1,
    id: "",
    title: "Storage & size",
    description: "Raw/compressed size and RAM recommendation (last 24h)",
    group: "System",
    refreshMs: 300_000,
    panels: [
      { id: "sz-raw", title: "Raw size (GiB)", grid: { x: 0, y: 0, w: 4, h: 4 }, query: { sql: `SELECT ROUND(MAX(RAW_OBJECT_SIZE), 3) AS RAW_GIB FROM ${S}` }, viz: { type: "kpi", unit: "GiB" } },
      { id: "sz-mem", title: "Compressed (GiB)", grid: { x: 4, y: 0, w: 4, h: 4 }, query: { sql: `SELECT ROUND(MAX(MEM_OBJECT_SIZE), 3) AS MEM_GIB FROM ${S}` }, viz: { type: "kpi", unit: "GiB" } },
      { id: "sz-ram", title: "Recommended DB RAM (GiB)", grid: { x: 8, y: 0, w: 4, h: 4 }, query: { sql: `SELECT ROUND(MAX(RECOMMENDED_DB_RAM_SIZE), 2) AS RECOMMENDED_GIB FROM ${S}` }, viz: { type: "kpi", unit: "GiB" } },
      { id: "sz-trend", title: "Size over the day", grid: { x: 0, y: 4, w: 12, h: 7 }, query: { sql: `SELECT TO_CHAR(MEASURE_TIME, 'HH24:MI') AS AT_TIME, ROUND(RAW_OBJECT_SIZE, 3) AS RAW_GIB, ROUND(MEM_OBJECT_SIZE, 3) AS MEM_GIB FROM ${S} ORDER BY MEASURE_TIME` }, viz: { type: "echarts", chart: "line" } },
    ],
  };
}

export const SYSTEM_DASHBOARDS = [queryPerfDashboard, sessionsDashboard, dbSizeDashboard];
