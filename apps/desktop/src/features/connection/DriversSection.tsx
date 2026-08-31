import { useEffect, useState } from "react";
import {
  Boxes,
  Cable,
  Check,
  Coffee,
  Download,
  ExternalLink,
  FileArchive,
  FileCode2,
  Loader2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { errorMessage, ipc, type DriverInfo } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/** One glyph per driver family (Boxicons/Lucide only — never emoji). */
export const DRIVER_ICON: Record<string, LucideIcon> = {
  "sqlx-exasol": Zap,
  pyexasol: FileCode2,
  sqlalchemy: Boxes,
  jdbc: Coffee,
  odbc: Cable,
};

export type DriverReadiness = { ready: boolean; supported: boolean; hint: string };

/**
 * Drivers section — a clean table over every driver family: icon, protocol,
 * live runtime status, and actions (Install runtime / custom JDBC JAR / docs).
 */
export function DriversSection({
  activeDriverId,
  onStatusChange,
}: {
  activeDriverId?: string;
  /** Lets the host (driver dropdown) refresh its installed-only list. */
  onStatusChange?: (status: Record<string, DriverReadiness>) => void;
}) {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [status, setStatus] = useState<Record<string, DriverReadiness>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = async (list: DriverInfo[]) => {
    const next: Record<string, DriverReadiness> = {};
    await Promise.all(
      list.map(async (d) => {
        next[d.id] = await ipc
          .driverStatus(d.id)
          .then((st) => ({ ready: st.ready, supported: st.supported, hint: st.hint }))
          .catch(() => ({ ready: false, supported: false, hint: "" }));
      }),
    );
    setStatus(next);
    onStatusChange?.(next);
  };

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const list = await ipc.listDrivers();
        if (dead) return;
        setDrivers(list);
        setOverrides(await ipc.driverOverridesGet().catch(() => ({})));
        await refreshStatus(list);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install(driverId: string) {
    setInstalling(driverId);
    setError(null);
    try {
      await ipc.driverSetup(driverId);
      await refreshStatus(drivers);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInstalling(null);
    }
  }

  async function pickJar(driverId: string) {
    setBusy(driverId);
    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "Java archive", extensions: ["jar"] }],
        title: "Choose the driver JAR",
      });
      if (typeof path === "string" && path) {
        setOverrides(await ipc.driverOverrideSet(driverId, path));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function clearJar(driverId: string) {
    setBusy(driverId);
    setError(null);
    try {
      setOverrides(await ipc.driverOverrideSet(driverId, null));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading drivers…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      {error ? (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border [scrollbar-width:thin]">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              {["Driver", "Protocol", "Status", "Artifact", ""].map((h, i) => (
                <th key={i} className="border-b border-border bg-secondary px-3 py-1.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const st = status[d.id];
              const jar = overrides[d.id];
              const Ic = DRIVER_ICON[d.id] ?? Zap;
              return (
                <tr key={d.id} className="align-top hover:bg-accent/40">
                  <td className="border-b border-border/60 px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <Ic className={cn("h-4 w-4 shrink-0", st?.ready ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          {d.name}
                          {d.id === activeDriverId ? (
                            <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-medium tracking-wide text-primary uppercase">in use</span>
                          ) : null}
                        </span>
                        <span className="block max-w-64 truncate text-[10.5px] text-muted-foreground" title={d.description}>{d.description}</span>
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">{d.protocol}</td>
                  <td className="border-b border-border/60 px-3 py-2 whitespace-nowrap">
                    {st?.ready ? (
                      <span className="flex w-fit items-center gap-1 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                        <Check className="h-2.5 w-2.5" /> Installed
                      </span>
                    ) : st?.supported ? (
                      <button
                        onClick={() => void install(d.id)}
                        disabled={installing !== null}
                        title={st.hint || `Install the ${d.name} runtime`}
                        className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                      >
                        {installing === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        {installing === d.id ? "Installing…" : "Install"}
                      </button>
                    ) : (
                      <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground">Not supported yet</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2">
                    {d.id === "jdbc" ? (
                      jar ? (
                        <span className="flex items-center gap-1.5">
                          <FileArchive className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="max-w-56 truncate font-mono text-[10.5px] text-foreground" title={jar}>{jar.split("/").pop()}</span>
                          <button
                            onClick={() => void clearJar(d.id)}
                            disabled={busy === d.id}
                            title="Back to the managed JAR"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => void pickJar(d.id)}
                          disabled={busy === d.id}
                          className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                        >
                          {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileArchive className="h-3 w-3" />} Custom JAR…
                        </button>
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2 text-right whitespace-nowrap">
                    <a
                      href={d.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`${d.name} documentation`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Only installed drivers appear in a connection's Driver Type dropdown. A custom JAR takes precedence over the
        managed one on the next connect. ODBC additionally needs Exasol's OS driver (Exasol Downloads) — detected
        automatically once present.
      </p>
    </div>
  );
}
