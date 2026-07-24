import { useEffect, useState } from "react";
import { BadgeCheck, ExternalLink, FileArchive, Loader2, TriangleAlert, X } from "lucide-react";
import { errorMessage, ipc, type DriverInfo } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Drivers section of the unified connection page (issue #22): every driver
 * Studio can speak, its runtime readiness, and — where the driver is a JAR —
 * a "use your own file" override so people can pin their own driver build.
 */
export function DriversSection({ activeDriverId }: { activeDriverId?: string }) {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [status, setStatus] = useState<Record<string, { ready: boolean; supported: boolean; hint: string }>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const list = await ipc.listDrivers();
        if (dead) return;
        setDrivers(list);
        setOverrides(await ipc.driverOverridesGet().catch(() => ({})));
        for (const d of list) {
          void ipc
            .driverStatus(d.id)
            .then((st) => !dead && setStatus((cur) => ({ ...cur, [d.id]: st })))
            .catch(() => undefined);
        }
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

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
    <div className="mx-auto max-w-3xl space-y-3 p-6">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
      ) : null}
      {drivers.map((d) => {
        const st = status[d.id];
        const jar = overrides[d.id];
        const canOverride = d.id === "jdbc";
        return (
          <div key={d.id} className="rounded-xl border border-border bg-panel/50 p-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">{d.name}</h3>
              {d.id === activeDriverId ? (
                <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-primary uppercase">this connection</span>
              ) : null}
              {st ? (
                st.ready ? (
                  <span className="flex items-center gap-1 rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-primary uppercase">
                    <BadgeCheck className="h-2.5 w-2.5" /> ready
                  </span>
                ) : st.supported ? (
                  <span className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-warning uppercase">
                    <TriangleAlert className="h-2.5 w-2.5" /> runtime missing
                  </span>
                ) : (
                  <span className="rounded bg-secondary px-1.5 py-px text-[9px] font-medium tracking-wide text-muted-foreground uppercase">not supported yet</span>
                )
              ) : null}
              <a
                href={d.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{d.protocol}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{d.description}</p>
            {st && !st.ready && st.hint ? <p className="mt-1.5 text-[11.5px] text-warning">{st.hint}</p> : null}
            {canOverride ? (
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <FileArchive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {jar ? (
                  <>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground" title={jar}>
                      {jar}
                    </span>
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-primary uppercase">custom jar</span>
                    <button
                      onClick={() => void clearJar(d.id)}
                      disabled={busy === d.id}
                      title="Back to the managed JAR"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                    Managed JAR (installed with the JDBC runtime)
                  </span>
                )}
                <button
                  onClick={() => void pickJar(d.id)}
                  disabled={busy === d.id}
                  className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Use custom JAR…
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The driver a connection uses is chosen on its Connection tab (Options → Driver Type). A custom JAR applies on the
        next connect.
      </p>
    </div>
  );
}
