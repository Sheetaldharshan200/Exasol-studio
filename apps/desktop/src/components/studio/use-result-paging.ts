// Server-side result paging for single-SELECT tabs.
//
// Page 0 is the plain run (its `truncated` flag means "there is a next page");
// later pages wrap the query with ORDER BY 1 + LIMIT/OFFSET, because Exasol
// needs a deterministic order for OFFSET. Visited pages are cached per tab and
// the next one is prefetched, so stepping through results is instant. The
// cache is stamped with the SQL that produced it, so a re-run or an edit
// invalidates it rather than mixing two queries' rows.
//
// Extracted from ExasolStudio.tsx, which must not grow.

import { useCallback, useEffect, useRef, useState } from "react";
import { splitStatements } from "../../lib/sql-text.ts";
import type { ExecuteResponse } from "../../lib/ipc.ts";

/** How many cached pages a tab keeps; the farthest from the current one goes. */
const MAX_CACHED_PAGES = 8;

/** The one statement a result can be paged from, or null if it cannot be. */
export function pageBase(sql: string): string | null {
  const stmts = splitStatements(sql);
  if (stmts.length !== 1) return null;
  const base = stmts[0].text.trim().replace(/;\s*$/, "");
  return /^select|^with/i.test(base) ? base : null;
}

/** Page 0 is the query itself; every later page is wrapped and offset. */
export function pagedSql(base: string, page: number, maxRows: number): string {
  return page === 0 ? base : `SELECT * FROM (\n${base}\n) ORDER BY 1 LIMIT ${maxRows + 1} OFFSET ${page * maxRows}`;
}

/** Which cached page to drop when a tab holds more than it should. */
export function farthestPage(pages: readonly number[], current: number): number {
  return pages.reduce((a, b) => (Math.abs(a - current) >= Math.abs(b - current) ? a : b));
}

export type TabPages = { sql: string; pages: Map<number, ExecuteResponse> };

/** Keep a page, then drop whatever is farthest from it until the tab is back
 *  within the cap. Every path that caches a page goes through here — a page
 *  turn caches just as often as a prefetch does, and only evicting on the
 *  prefetch path let a long walk through a big result grow without limit. */
export function cachePage(entry: TabPages, page: number, res: ExecuteResponse): void {
  entry.pages.set(page, res);
  while (entry.pages.size > MAX_CACHED_PAGES) entry.pages.delete(farthestPage([...entry.pages.keys()], page));
}

type Tab = {
  id: string;
  sql: string;
  response: ExecuteResponse | null;
  resultPage?: number;
  runMeta?: { sql?: string };
};

export function useResultPaging(opts: {
  connection: { profile: { id: string; name: string } } | null;
  activeTab: Tab;
  maxRows: number;
  /** Run a statement only if nothing newer has started on that connection. */
  execIfCurrent: (
    gen: number,
    profileId: string,
    connectionName: string,
    sql: string,
    maxRows: number,
  ) => Promise<ExecuteResponse | null>;
  genOf: (profileId: string) => number;
  /** Only ever asked to write the result of a page turn. */
  patchTab: (id: string, patch: { response: ExecuteResponse; execError: string | null; resultPage: number }) => void;
  onError: (message: string) => void;
}) {
  const { connection, activeTab, maxRows, execIfCurrent, genOf, patchTab, onError } = opts;
  const [paging, setPaging] = useState(false);
  const cache = useRef(new Map<string, { sql: string; pages: Map<number, ExecuteResponse> }>());
  const inFlight = useRef(new Set<string>());
  // Latest values for the callbacks, which are not re-created per render.
  const ctx = useRef(opts);
  ctx.current = opts;

  const prefetch = useCallback(async (tabId: string, base: string, page: number) => {
    const { connection: conn, maxRows: rows, execIfCurrent: exec, genOf: gen } = ctx.current;
    if (!conn || page < 0) return;
    const key = `${tabId}:${page}`;
    const entry = cache.current.get(tabId);
    if (inFlight.current.has(key) || !entry || entry.sql !== base || entry.pages.has(page)) return;
    inFlight.current.add(key);
    try {
      const pid = conn.profile.id;
      const at = gen(pid);
      const res = await exec(at, pid, conn.profile.name, pagedSql(base, page, rows), rows);
      const cur = cache.current.get(tabId);
      if (res && gen(pid) === at && res.success && cur && cur.sql === base) cachePage(cur, page, res);
    } catch {
      /* a prefetch is a nicety — a failure just means no instant next page */
    } finally {
      inFlight.current.delete(key);
    }
  }, []);

  // A fresh run (a page-0 response we did not serve from cache) seeds the
  // cache and warms page 1 immediately.
  useEffect(() => {
    const res = activeTab.response;
    if (!res || (activeTab.resultPage ?? 0) !== 0 || !res.success) return;
    const base = pageBase(activeTab.runMeta?.sql ?? activeTab.sql);
    if (!base) return;
    const entry = cache.current.get(activeTab.id);
    if (entry && entry.sql === base && entry.pages.get(0) === res) return; // cache-served, not a new run
    cache.current.set(activeTab.id, { sql: base, pages: new Map([[0, res]]) });
    if (res.results[0]?.truncated) void prefetch(activeTab.id, base, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, activeTab.response, activeTab.resultPage]);

  const loadResultPage = useCallback(
    async (page: number) => {
      if (!connection || page < 0) return;
      // Page 2 must come from the statement that produced page 1, even if the
      // editor has moved on since.
      const base = pageBase(activeTab.runMeta?.sql ?? activeTab.sql);
      if (!base) return;
      const entry = cache.current.get(activeTab.id);
      const cached = entry && entry.sql === base ? entry.pages.get(page) : undefined;
      if (cached) {
        patchTab(activeTab.id, { response: cached, execError: null, resultPage: page });
        if (cached.results[0]?.truncated) void prefetch(activeTab.id, base, page + 1);
        if (page > 0) void prefetch(activeTab.id, base, page - 1);
        return;
      }
      if (paging) return;
      setPaging(true);
      try {
        // Page turns are navigation, not new work — the LIMIT/OFFSET wrappers
        // stay out of the execution log; the original run is already in it.
        const pid = connection.profile.id;
        const at = genOf(pid);
        const res = await execIfCurrent(at, pid, connection.profile.name, pagedSql(base, page, maxRows), maxRows);
        // A run started while this page was queued or in flight: its rows own
        // the tab now, and this answer is dropped (or was never fetched).
        if (!res || genOf(pid) !== at) return;
        const cur = cache.current.get(activeTab.id);
        if (res.success && cur && cur.sql === base) cachePage(cur, page, res);
        patchTab(activeTab.id, {
          response: res,
          execError: res.success ? null : res.results.find((r) => r.error)?.error ?? null,
          resultPage: page,
        });
        if (res.success && res.results[0]?.truncated) void prefetch(activeTab.id, base, page + 1);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setPaging(false);
      }
    },
    [connection, activeTab, maxRows, paging, execIfCurrent, genOf, patchTab, onError, prefetch],
  );

  return { paging, loadResultPage, pageBase };
}
