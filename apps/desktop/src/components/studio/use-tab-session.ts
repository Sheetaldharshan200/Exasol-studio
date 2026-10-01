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
      const conn = ctx.current.connection;
      if (!conn || !tabId) return;
      try {
        store(tabId, await ipc.sessionInfo(conn.profile.id, tabId));
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
    (tabs: readonly { id: string; title: string }[], title = "Close with uncommitted changes?"): Promise<boolean> => {
      const dirty = tabs.map((t) => ({ ...t, info: infos[t.id] })).filter((t) => t.info && !t.info.autocommit && t.info.changes > 0);
      const end = (commit: boolean) => Promise.all(tabs.map((t) => ipc.sessionClose(t.id, commit).catch(() => null)));
      if (!dirty.length) {
        void end(false);
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        setPending({
          title,
          question: pendingSummary(dirty.map((t) => ({ title: t.title, changes: t.info!.changes }))),
          recent: dirty.flatMap((t) => t.info!.recent).slice(0, 10),
          onChoose: (choice) => {
            setPending(null);
            if (choice === "cancel") return resolve(false);
            void end(choice === "commit").then(() => {
              setInfos((m) => {
                const next = { ...m };
                for (const t of tabs) delete next[t.id];
                return next;
              });
              resolve(true);
            });
          },
        });
      });
    },
    [infos],
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
