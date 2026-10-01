// The SQL tab's own database session, as the shell sees it: what mode it is
// in, what is uncommitted, and the actions that act on THAT session only.
// Extracted so ExasolStudio.tsx does not grow.

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, ipc, type SessionInfo } from "@/lib/ipc";
import { idleWarning, pendingSummary } from "@/lib/txn-state";
import type { PendingClose } from "./UncommittedDialog";

type Conn = { profile: { id: string; name: string } } | null;
type Notify = (kind: "info" | "warning" | "success", title: string, body: string) => void;

export function useTabSession(opts: {
  connection: Conn;
  activeTabId: string;
  isSqlTab: boolean;
  notify: Notify;
  /** Every SQL tab of every connection — what quitting would end. */
  allSqlTabs: () => { id: string; title: string }[];
}) {
  const { connection, activeTabId, isSqlTab, notify } = opts;
  const [infos, setInfos] = useState<Record<string, SessionInfo>>({});
  const [pending, setPending] = useState<PendingClose | null>(null);
  const warned = useRef(new Set<string>());
  const ctx = useRef(opts);
  ctx.current = opts;

  const store = useCallback((tabId: string, info: SessionInfo) => setInfos((m) => ({ ...m, [tabId]: info })), []);

  const refresh = useCallback(
    async (tabId = ctx.current.activeTabId) => {
      if (!tabId) return;
      try {
        store(tabId, await ipc.sessionInfo(tabId));
      } catch {
        /* no session yet, or disconnected */
      }
    },
    [store],
  );

  // A tab that is shown gets its session's state; an idle open transaction is
  // called out once.
  useEffect(() => {
    if (connection && isSqlTab && activeTabId) void refresh(activeTabId);
  }, [connection, activeTabId, isSqlTab, refresh]);
  useEffect(() => {
    const t = window.setInterval(() => {
      for (const [tabId, info] of Object.entries(infos)) {
        const msg = idleWarning(info);
        if (msg && !warned.current.has(tabId)) {
          warned.current.add(tabId);
          ctx.current.notify("warning", "Open transaction", msg);
        }
      }
      void refresh();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [infos, refresh]);

  const act = useCallback(
    async (label: string, run: (profileId: string, tabId: string) => Promise<SessionInfo>) => {
      const conn = ctx.current.connection;
      const tabId = ctx.current.activeTabId;
      if (!conn || !tabId) return;
      try {
        store(tabId, await run(conn.profile.id, tabId));
        warned.current.delete(tabId);
      } catch (e) {
        notify("warning", label, errorMessage(e));
      }
    },
    [store, notify],
  );

  const setAutocommit = useCallback((on: boolean) => act("Could not change auto-commit", (p, t) => ipc.sessionSetAutocommit(p, t, on)), [act]);
  const commit = useCallback(() => act("Commit failed", (p, t) => ipc.sessionCommit(p, t)), [act]);
  const rollback = useCallback(() => act("Rollback failed", (p, t) => ipc.sessionRollback(p, t)), [act]);
  const setSchema = useCallback((schema: string) => act("Could not open the schema", (p, t) => ipc.sessionSetSchema(p, t, schema)), [act]);

  /**
   * Before tabs close: tabs whose transactions hold changes ask Commit / Roll
   * back / Cancel; then every closing tab's session is ended. Resolves false
   * when the person cancels.
   */
  const settleRef = useRef<(tabs: readonly { id: string; title: string }[], title?: string) => Promise<boolean>>(() => Promise.resolve(true));
  const settleBeforeClose = useCallback(
    async (tabs: readonly { id: string; title: string }[], title = "Close with uncommitted changes?"): Promise<boolean> => {
      if (!tabs.length) return true;
      // Ask the backend, not the cache: a tab's last run may have changed
      // rows since its state was last fetched.
      let open: { tabId: string; changes: number; recent: string[]; changeSeq: number }[];
      try {
        open = await ipc.sessionsWithChanges();
      } catch (e) {
        notify("warning", "Could not check for uncommitted changes", errorMessage(e));
        return false;
      }
      const byId = new Map(open.map((p) => [p.tabId, p]));
      const dirty = tabs.flatMap((t) => {
        const p = byId.get(t.id);
        return p && p.changes > 0 ? [{ title: t.title, changes: p.changes, recent: p.recent }] : [];
      });
      const forget = (ids: string[]) =>
        setInfos((m) => {
          const next = { ...m };
          for (const id of ids) delete next[id];
          return next;
        });
      // A failed commit, or changes that arrived after the question, are
      // reported and the tabs stay open with their sessions.
      // Each close names the version of the changes the person was shown:
      // the backend refuses if they changed meanwhile.
      const end = async (commit: boolean) => {
        const results = await Promise.allSettled(tabs.map((t) => ipc.sessionClose(t.id, commit, byId.get(t.id)?.changeSeq)));
        forget(tabs.filter((_, i) => results[i].status === "fulfilled").map((t) => t.id));
        tabs.forEach((t, i) => results[i].status === "rejected" && void refresh(t.id));
        const failed = results.flatMap((r) => (r.status === "rejected" ? [errorMessage(r.reason)] : []));
        if (failed.length) notify("warning", commit ? "Commit not confirmed" : "Tab kept open", failed.join("\n"));
        return failed.length === 0;
      };
      if (!dirty.length) return end(false);
      const choice = await new Promise<"commit" | "rollback" | "cancel">((resolve) =>
        setPending({
          title,
          question: pendingSummary(dirty),
          recent: dirty.flatMap((t) => t.recent).slice(0, 10),
          onChoose: (c) => {
            setPending(null);
            resolve(c);
          },
        }),
      );
      if (choice === "cancel") return false;
      return end(choice === "commit");
    },
    [notify, refresh],
  );
  settleRef.current = settleBeforeClose;

  // Quitting with uncommitted work: Rust holds the window and asks; the
  // answer comes from the same dialog closing a tab uses.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("studio:quit-requested", () => {
          void ipc.quitAck().catch(() => null);
          void settleRef.current(ctx.current.allSqlTabs(), "Quit with uncommitted changes?").then((ok) => {
            if (ok) void ipc.quitApp();
          });
        }),
      )
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return { info: infos[activeTabId] ?? null, refresh, setAutocommit, commit, rollback, setSchema, settleBeforeClose, pending };
}
