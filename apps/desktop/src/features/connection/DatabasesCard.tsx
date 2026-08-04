import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, ipc } from "@/lib/ipc";
import { AdminApiConnect, useAdminApi } from "./AdminApiConnect";

/**
 * The Admin UI's "Databases" screen (database-control spec): the cluster's
 * databases with live state and confirmed start/stop. Rendered inside the
 * Health tab; collapses to the Admin API connect form when disconnected.
 */
export function DatabasesCard({ profileId, connectionName, dbHost }: { profileId: string; connectionName: string; dbHost: string }) {
  const { status, refresh: refreshStatus } = useAdminApi(profileId);
  const [rows, setRows] = useState<{ name: string; state: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!status.connected) return;
    setLoading(true);
    try {
      const dbs = (await ipc.confdJob(profileId, "db_list", {})) as unknown;
      const names = Array.isArray(dbs) ? dbs.map(String) : [];
      const withState = await Promise.all(
        names.map(async (name) => ({
          name,
          state: String((await ipc.confdJob(profileId, "db_state", { db_name: name }).catch((e) => errorMessage(e))) ?? "unknown"),
        })),
      );
      setRows(withState);
    } finally {
      setLoading(false);
    }
  }, [status.connected, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(name: string, job: "db_start" | "db_stop") {
    setActing(name);
    setConfirmStop(null);
    try {
      await ipc.confdJob(profileId, job, { db_name: name });
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: { kind: "success", title: `${job === "db_start" ? "Start" : "Stop"} requested — ${name}`, body: `The cluster acknowledged ${job} for ${name} (${connectionName}).` },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("studio:notice", { detail: { kind: "warning", title: `${job} failed — ${name}`, body: errorMessage(e) } }),
      );
    } finally {
      setActing(null);
      void load();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Play className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-semibold">Databases (cluster)</span>
        {status.connected ? (
          <button onClick={() => void load()} title="Refresh" className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {!status.connected ? (
        <AdminApiConnect profileId={profileId} defaultHost={dbHost} status={status} onChanged={refreshStatus} />
      ) : rows.length === 0 && !loading ? (
        <p className="text-[12px] text-muted-foreground">The cluster reports no databases.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((db) => {
            const running = /run/i.test(db.state);
            return (
              <div key={db.name} className="flex items-center gap-2 rounded-md border border-border/60 bg-panel px-2.5 py-1.5 text-[12px]">
                <span className={cn("h-2 w-2 rounded-full", running ? "bg-primary" : "bg-muted-foreground/50")} />
                <span className="font-mono font-medium">{db.name}</span>
                <span className="text-muted-foreground">{db.state}</span>
                <span className="ml-auto" />
                {confirmStop === db.name ? (
                  <>
                    <span className="text-[11.5px] text-destructive">Stop {db.name}? Active sessions terminate.</span>
                    <button onClick={() => void act(db.name, "db_stop")} className="h-6 rounded-md bg-destructive px-2 text-[11.5px] font-medium text-white hover:bg-destructive/85">
                      Stop
                    </button>
                    <button onClick={() => setConfirmStop(null)} className="h-6 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </>
                ) : acting === db.name ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : running ? (
                  <button onClick={() => setConfirmStop(db.name)} className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:text-destructive">
                    <Square className="h-3 w-3" /> Stop
                  </button>
                ) : (
                  <button onClick={() => void act(db.name, "db_start")} className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground">
                    <Play className="h-3 w-3" /> Start
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
