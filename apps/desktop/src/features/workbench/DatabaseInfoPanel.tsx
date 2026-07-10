import { useEffect, useMemo, useState } from "react";
import { Cpu, Database, Hash, Info, Loader2, Search, Server, Waypoints } from "lucide-react";
import { Input } from "@/components/ui/input";
import { errorMessage, ipc, type DatabaseInfo } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/** Look up a metadata value by its EXA_METADATA PARAM_NAME. */
function meta(info: DatabaseInfo | null, key: string): string | null {
  return info?.metadata.find((m) => m.name === key)?.value ?? null;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Server;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel/60 px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="eyebrow-muted">{label}</p>
        <p className="truncate font-mono text-[13px] text-foreground">{value ?? "—"}</p>
      </div>
    </div>
  );
}

export function DatabaseInfoPanel({
  profileId,
  connectionName,
}: {
  profileId: string;
  connectionName: string;
}) {
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    ipc
      .getDatabaseInfo(profileId)
      .then((data) => alive && setInfo(data))
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profileId]);

  const needle = query.trim().toLowerCase();
  const metadata = useMemo(
    () =>
      (info?.metadata ?? []).filter(
        (m) =>
          !needle ||
          m.name.toLowerCase().includes(needle) ||
          (m.value ?? "").toLowerCase().includes(needle),
      ),
    [info, needle],
  );
  const parameters = useMemo(
    () => (info?.parameters ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle)),
    [info, needle],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading database info…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-editor">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-heading text-[15px] font-bold text-foreground">Database Info</h2>
            <p className="text-xs text-muted-foreground">{connectionName}</p>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Database} label="Database" value={meta(info, "databaseName")} />
          <StatCard
            icon={Server}
            label="Version"
            value={meta(info, "databaseProductVersion") ?? meta(info, "productName")}
          />
          <StatCard icon={Cpu} label="Nodes" value={meta(info, "nodeCount")} />
          <StatCard icon={Waypoints} label="Time zone" value={meta(info, "timeZone")} />
        </div>

        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
            placeholder="Filter metadata and parameters…"
          />
        </div>

        <InfoTable
          title="Server metadata"
          count={metadata.length}
          columns={["Property", "Value"]}
          rows={metadata.map((m) => [m.name, m.value ?? "—"])}
        />

        <div className="h-5" />

        <InfoTable
          title="Parameters"
          count={parameters.length}
          columns={["Parameter", "Session", "System"]}
          rows={parameters.map((p) => [p.name, p.sessionValue ?? "—", p.systemValue ?? "—"])}
          firstColIcon={<Hash className="h-3 w-3 text-muted-foreground/60" />}
        />
      </div>
    </div>
  );
}

function InfoTable({
  title,
  count,
  columns,
  rows,
  firstColIcon,
}: {
  title: string;
  count: number;
  columns: string[];
  rows: string[][];
  firstColIcon?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-3 py-2">
        <span className="eyebrow-muted">{title}</span>
        <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {count}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches.</div>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-secondary/30 text-left text-muted-foreground">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={cn(
                    "border-b border-border px-3 py-1.5 font-medium",
                    i > 0 && "border-l",
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-transparent even:bg-secondary/20 hover:bg-accent/50">
                {row.map((cellValue, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "border-b border-border px-3 py-1.5 align-top",
                      ci > 0 && "border-l",
                      ci === 0 ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {ci === 0 ? (
                      <span className="flex items-center gap-1.5">
                        {firstColIcon}
                        {cellValue}
                      </span>
                    ) : (
                      cellValue
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
