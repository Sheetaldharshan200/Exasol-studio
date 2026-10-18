// DBA monitoring: statements running now (longest first) and transaction
// conflicts still waiting. Refreshes every few seconds while shown. Killing
// opens the SQL to review, like every DBA action: a statement (the session
// survives) or a whole session.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, X } from "lucide-react";
import { errorMessage, ipc } from "@/lib/ipc";
import { dbaSql, LOCKS_SQL, RUNNING_SQL } from "./dba-sql";

const REFRESH_MS = 5000;

export function DbaMonitor({
  profileId,
  connectionName,
  kind,
  canKill,
  onKill,
}: {
  profileId: string;
  connectionName: string;
  kind: "running" | "locks";
  canKill: boolean;
  onKill: (sql: string, title: string) => void;
}) {
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);

  // Only the latest request may fill the table: a Running answer arriving
  // after a switch to Locks would put the wrong rows (and kill buttons) there.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const req = ++latest.current;
    setBusy(true);
    try {
      const res = await ipc.executeSql(profileId, connectionName, kind === "running" ? RUNNING_SQL : LOCKS_SQL, 1000, false, false);
      if (req !== latest.current) return;
      const r = res.results.find((x) => x.kind === "resultSet");
      if (r?.error) throw new Error(r.error);
      setRows((r?.rows as unknown[][]) ?? []);
      setError(null);
    } catch (e) {
      if (req === latest.current) setError(errorMessage(e));
    } finally {
      if (req === latest.current) setBusy(false);
    }
  }, [profileId, connectionName, kind]);

  useEffect(() => {
    setRows(null);
    void load();
    const t = live ? window.setInterval(() => void load(), REFRESH_MS) : undefined;
    return () => {
      window.clearInterval(t);
      latest.current++;
    };
  }, [load, live]);

  const head =
    kind === "running"
      ? ["Session", "User", "Command", "Duration", "Activity", "SQL"]
      : ["Session", "Waits for", "Since", "Type", "Objects", "Info"];
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span>
          {kind === "running" ? "Statements running now, longest first." : "Transactions waiting for another transaction (lock and conflict waits)."}
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-primary" /> Refresh every 5 s
        </label>
        <button onClick={() => void load()} aria-label="Refresh" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary hover:text-foreground">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[12px] text-destructive">{error}</p> : null}
      {rows && !rows.length && !error ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">{kind === "running" ? "No statement is running." : "No transaction is waiting."}</p>
      ) : null}
      {rows?.length ? (
        <div className="min-h-0 overflow-auto rounded-md border border-border">
          <table className="w-full table-fixed text-[12px]">
            <colgroup>
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-36" />
              <col />
              {canKill ? <col className="w-44" /> : null}
            </colgroup>
            <thead className="bg-secondary text-left text-[11px] text-muted-foreground">
              <tr>
                {head.map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                ))}
                {canKill ? <th /> : null}
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((r, i) => {
                const session = cell(r[0]);
                return (
                  <tr key={`${session}-${i}`} className="border-t border-border/60 align-top">
                    {r.map((v, j) => (
                      <td key={j} className="truncate px-2 py-1" title={cell(v)}>{cell(v)}</td>
                    ))}
                    {canKill ? (
                      <td className="px-2 py-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => onKill(dbaSql.killStatement(session), `Kill the statement in session ${session}`)}
                            className="flex items-center gap-1 rounded border border-border px-1.5 text-[11px] text-foreground hover:bg-secondary"
                          >
                            <X className="h-3 w-3" /> Statement
                          </button>
                          <button
                            onClick={() => onKill(dbaSql.killSession(session), `Kill session ${session}`)}
                            className="flex items-center gap-1 rounded border border-destructive/40 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-3 w-3" /> Session
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
