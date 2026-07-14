import { useEffect, useState } from "react";
import { BookUser, Boxes, GaugeCircle, HardDrive, Loader2, Plug, Shield, Users } from "lucide-react";
import { errorMessage, ipc, type DbaOverview } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Section = "users" | "roles" | "consumerGroups" | "connections" | "sessions" | "dbSize";
const TABS: { id: Section; label: string; icon: typeof Users }[] = [
  { id: "sessions", label: "Sessions", icon: GaugeCircle },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "consumerGroups", label: "Consumer Groups", icon: Boxes },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "dbSize", label: "DB Size", icon: HardDrive },
];

/** Consolidated DBA dashboard (EXA_DBA_* views) for one connection. */
export function DbaDashboard({ profileId, connectionName }: { profileId: string; connectionName: string }) {
  const [dba, setDba] = useState<DbaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Section>("sessions");

  const load = () => {
    setLoading(true);
    setError(null);
    ipc.getDbaOverview(profileId).then(setDba).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(load, [profileId]);

  return (
    <div className="flex h-full flex-col bg-editor">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <BookUser className="h-4 w-4 text-primary" />
        <span className="text-[14px] font-bold text-foreground">DBA · {connectionName}</span>
        <button onClick={load} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary">
          Refresh
        </button>
      </header>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = dba ? (t.id === "dbSize" ? undefined : (dba[t.id] as unknown[]).length) : undefined;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[12.5px] transition-colors",
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              {n != null ? <span className="rounded bg-secondary px-1 font-mono text-[10px]">{n}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : error ? (
          <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-muted-foreground">{error}</div>
        ) : !dba ? null : tab === "dbSize" ? (
          <Grid
            columns={["Measure time", "Raw size", "Mem size", "Auxiliary", "Statistics", "Recommended RAM"]}
            rows={
              dba.dbSize
                ? [[dba.dbSize.measureTime, dba.dbSize.rawObjectSize, dba.dbSize.memObjectSize, dba.dbSize.auxiliarySize, dba.dbSize.statisticsSize, dba.dbSize.recommendedDbRamSize].map((v) => (v == null ? "" : String(v)))]
                : []
            }
          />
        ) : tab === "users" ? (
          <Grid columns={["Name", "Created", "Consumer group", "Comment"]} rows={dba.users.map((u) => [u.name, u.created ?? "", u.consumerGroup ?? "", u.comment ?? ""])} />
        ) : tab === "roles" ? (
          <Grid columns={["Name", "Created", "Consumer group", "Comment"]} rows={dba.roles.map((r) => [r.name, r.created ?? "", r.consumerGroup ?? "", r.comment ?? ""])} />
        ) : tab === "consumerGroups" ? (
          <Grid
            columns={["Name", "CPU weight", "Precedence", "Query timeout", "Idle timeout"]}
            rows={dba.consumerGroups.map((g) => [g.name, g.cpuWeight, g.precedence, g.queryTimeout, g.idleTimeout].map((v) => (v == null ? "" : String(v))))}
          />
        ) : tab === "connections" ? (
          <Grid columns={["Name", "Connection string", "User", "Created", "Comment"]} rows={dba.connections.map((c) => [c.name, c.connectionString ?? "", c.userName ?? "", c.created ?? "", c.comment ?? ""])} />
        ) : (
          <Grid
            columns={["Session", "User", "Status", "Command", "Duration", "Client", "Login time"]}
            rows={dba.sessions.map((s) => [s.sessionId, s.userName ?? "", s.status ?? "", s.command ?? "", s.duration ?? "", s.client ?? "", s.loginTime ?? ""])}
          />
        )}
      </div>
    </div>
  );
}

function Grid({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted-foreground">No rows.</p>;
  return (
    <table className="w-full border-collapse border border-border text-[12px]">
      <thead>
        <tr className="bg-secondary text-left">
          {columns.map((c) => (
            <th key={c} className="border border-border px-3 py-1.5 font-medium text-foreground">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((r, i) => (
          <tr key={i} className="even:bg-secondary/30">
            {r.map((v, j) => (
              <td key={j} className="max-w-[380px] truncate border border-border px-3 py-1 text-foreground/90">{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
