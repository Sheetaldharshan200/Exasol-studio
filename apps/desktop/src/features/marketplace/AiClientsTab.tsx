import { useEffect, useState } from "react";
import { Check, Copy, Database, Loader2, Plug, RefreshCcw, Unplug } from "lucide-react";
import { AiClientMark } from "@/features/marketplace/ai-client-marks";
import { errorMessage, ipc, type AiClientStatus } from "@/lib/ipc";
import { agent } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/** One row in the "Databases on the gateway" bus panel. */
type BusRow = {
  id: string;
  name: string;
  host: string;
  /** connected in Studio (registered on the bus) */
  connected: boolean;
  /** MCP exposure flag (only meaningful when connected) */
  exposed: boolean;
  /** Which MCP services this connection carries on the bus. */
  caps: { sql: boolean; nl2sql: boolean };
};

/**
 * Marketplace → AI clients: connect OTHER AI apps (Claude, Codex, Cursor, …)
 * to the Exasol Studio MCP GATEWAY — one `exasol-studio` entry that speaks
 * for EVERY database connected in Studio, not one MCP config per database.
 * Deliberately separate from the in-app agent's connectors (which bring
 * tools INTO the Studio agent).
 */
export function AiClientsTab({ layout = "list" }: { layout?: "grid" | "list" }) {
  const [clients, setClients] = useState<AiClientStatus[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [prereq, setPrereq] = useState<{ ready: boolean; reason?: string | null } | null>(null);
  const [bus, setBus] = useState<BusRow[] | null>(null);
  const [busToggling, setBusToggling] = useState<Record<string, boolean>>({});

  // The bus panel merges two sources: profiles saved in Studio (so a
  // connection that EXISTS but is not connected still shows, with a "connect
  // it first" state) and the sidecar's gateway registry (which of the
  // connected ones are exposed to external MCP clients).
  const [services, setServices] = useState<{ id: string; exposed: boolean }[]>([]);
  const loadBus = async () => {
    try {
      const profiles = await ipc.listConnectionProfiles();
      const gw = await agent.gatewayDatabases().catch(() => ({ databases: [], services: [] }) as Awaited<ReturnType<typeof agent.gatewayDatabases>>);
      const byId = new Map(gw.databases.map((d) => [d.id, d]));
      const rows: BusRow[] = profiles
        .filter((p) => !p.username.startsWith("STUDIO_MCP_"))
        .map((p) => ({
          id: p.id,
          name: p.name,
          host: `${p.host}:${p.port}`,
          connected: byId.has(p.id),
          exposed: byId.get(p.id)?.exposed ?? true,
          caps: byId.get(p.id)?.caps ?? { sql: true, nl2sql: true },
        }));
      // Registered connections whose profile vanished still belong on the bus.
      for (const d of gw.databases) {
        if (!rows.some((r) => r.id === d.id)) rows.push({ id: d.id, name: d.name, host: "", connected: true, exposed: d.exposed, caps: d.caps });
      }
      rows.sort((a2, b2) => Number(b2.connected) - Number(a2.connected) || a2.name.localeCompare(b2.name));
      setBus(rows);
      setServices(gw.services ?? []);
    } catch {
      setBus([]);
    }
  };

  async function toggleExposure(row: BusRow) {
    setBusToggling((b) => ({ ...b, [row.id]: true }));
    try {
      await agent.setGatewayExposure(row.id, { exposed: !row.exposed });
      setBus((list) => (list ?? []).map((r) => (r.id === row.id ? { ...r, exposed: !row.exposed } : r)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusToggling((b) => ({ ...b, [row.id]: false }));
    }
  }

  async function toggleService(id: string, exposed: boolean) {
    try {
      await agent.setGatewayService(id, exposed);
      setServices((list) => list.map((sv) => (sv.id === id ? { ...sv, exposed } : sv)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const refresh = async () => {
    setScanning(true);
    try {
      setClients(await ipc.listAiClients());
      setPrereq(await ipc.aiClientsReady().catch(() => ({ ready: true })));
      await loadBus();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      // Keep the spin visible long enough to read as a scan, not a flicker.
      window.setTimeout(() => setScanning(false), 500);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(c: AiClientStatus, fn: () => Promise<AiClientStatus>) {
    setBusy((b) => ({ ...b, [c.id]: true }));
    setError(null);
    try {
      const next = await fn();
      setClients((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  }

  async function copySnippet(c: AiClientStatus) {
    setError(null);
    try {
      const snippet = await ipc.aiClientSnippet(c.id);
      await navigator.clipboard?.writeText(snippet);
      setCopied(c.id);
      window.setTimeout(() => setCopied((cur) => (cur === c.id ? null : cur)), 1600);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const detected = (clients ?? []).filter((c) => c.detected);
  const others = (clients ?? []).filter((c) => !c.detected);

  const badge = (c: AiClientStatus) =>
    c.connected ? (
      <span className="flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
        <Check className="h-2.5 w-2.5" /> connected
      </span>
    ) : c.detected ? (
      <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium uppercase text-muted-foreground">detected</span>
    ) : null;

  // Shared action pair; `full` stretches the buttons in grid cards.
  const actions = (c: AiClientStatus, full = false) => (
    <>
      <button
        onClick={() => void copySnippet(c)}
        disabled={prereq ? !prereq.ready : false}
        title="Copy the exasol MCP entry for this client's config"
        className={cn("flex h-7 items-center justify-center gap-1 rounded-md border border-border text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40", full ? "flex-1" : "w-[96px]")}
      >
        {copied === c.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />} Snippet
      </button>
      {c.auto ? (
        c.connected ? (
          <button
            onClick={() => void act(c, () => ipc.disconnectAiClient(c.id))}
            disabled={busy[c.id]}
            className={cn("flex h-7 items-center justify-center gap-1 rounded-md border border-border text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50", full ? "flex-1" : "w-[124px]")}
          >
            {busy[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Disconnect
          </button>
        ) : (
          <button
            onClick={() => void act(c, () => ipc.connectAiClient(c.id))}
            disabled={busy[c.id] || (prereq ? !prereq.ready : false)}
            className={cn("cta-glow flex h-7 items-center justify-center gap-1 rounded-md bg-primary text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50", full ? "flex-1" : "w-[124px]")}
          >
            {busy[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Connect
          </button>
        )
      ) : (
        <span className={cn("flex h-7 items-center justify-center rounded-md border border-dashed border-border/60 text-[10.5px] text-muted-foreground", full ? "flex-1" : "w-[124px]")}>manual config</span>
      )}
    </>
  );

  return (
    <div>
      <div className="mb-4 max-w-4xl rounded-lg border border-border bg-panel/50 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Use every connected database from other AI clients.</span> One click
          writes a single <span className="font-mono text-[11px]">exasol-studio</span> gateway into the client's own MCP
          config (a backup is kept). The gateway is a bus: it speaks for <span className="font-medium text-foreground">all databases
          connected in Studio</span>, and one connection can carry several MCP services — SQL (schema + read-only queries),
          Text to SQL (generate a statement from a question, never auto-run), and Studio services like Dashboards. Pick per
          connection below; connect or disconnect a database and the client follows, no per-database setup.
          It is <span className="font-medium text-foreground">read-only</span>: only single SELECT / WITH / DESCRIBE
          statements are accepted, and no credentials are written to the client's config. Studio must be running for the
          gateway to answer. Restart the client after connecting.
        </p>
        <p className="mt-1.5">
          This is separate from the <span className="font-medium text-foreground">MCP connectors</span> panel, which brings
          external tools <em>into</em> the Studio agent. Here, your database goes <em>out</em> to other clients.
        </p>
      </div>

      {prereq && !prereq.ready ? (
        <div className="mb-3 max-w-4xl rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Not ready yet.</span> {prereq.reason}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
      ) : null}

      {/* The bus itself: which databases external clients can reach right now. */}
      <section className="mb-5 max-w-4xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Databases on the gateway</p>
          <button
            onClick={() => void loadBus()}
            className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {bus === null ? (
          <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the gateway…
          </div>
        ) : bus.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-[12px] text-muted-foreground">
            No connections saved yet — add one in the Databases sidebar; it appears here and on the gateway once connected.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-panel/50">
            {bus.map((row, i) => (
              <div key={row.id} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-border/60")}>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    row.connected && row.exposed
                      ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                      : row.connected
                        ? "bg-warning"
                        : "border border-muted-foreground/50 bg-transparent",
                  )}
                />
                <Database className={cn("h-3.5 w-3.5 shrink-0", row.connected ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-medium text-foreground">{row.name}</span>
                  {row.host ? <span className="ml-2 font-mono text-[10.5px] text-muted-foreground">{row.host}</span> : null}
                </div>
                {row.connected ? (
                  <>
                    {row.exposed ? (
                      <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">on the gateway</span>
                    ) : (
                      <span className="rounded bg-warning/15 px-1.5 py-px text-[9px] font-medium uppercase text-warning">MCP off</span>
                    )}
                    <button
                      onClick={() => void toggleExposure(row)}
                      disabled={busToggling[row.id]}
                      title={row.exposed ? "Hide this database from external MCP clients" : "Expose this database to external MCP clients"}
                      aria-label={`Turn MCP exposure ${row.exposed ? "off" : "on"} for ${row.name}`}
                      className={cn(
                        "relative h-4.5 w-8 shrink-0 rounded-full transition-colors disabled:opacity-50",
                        row.exposed ? "bg-primary" : "bg-secondary",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-[left]",
                          row.exposed ? "left-4" : "left-0.5",
                        )}
                      />
                    </button>
                  </>
                ) : (
                  <span
                    className="rounded bg-secondary px-1.5 py-px text-[9px] font-medium uppercase text-muted-foreground"
                    title="This connection exists in Studio but is not connected, so it is not on the gateway. Connect it in the Databases sidebar."
                  >
                    not connected — no MCP
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {services.length ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-border/70 bg-panel/50">
            {services.map((sv, i) => (
              <div key={sv.id} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-border/60")}>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", sv.exposed ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "border border-muted-foreground/50 bg-transparent")} />
                <div className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-medium capitalize text-foreground">{sv.id}</span>
                  <span className="ml-2 text-[10.5px] text-muted-foreground">
                    {sv.id === "dashboards" ? "Studio's saved BI dashboards (panel SQL included)" : "Studio service"}
                  </span>
                </div>
                <span className={cn("rounded px-1.5 py-px text-[9px] font-medium uppercase", sv.exposed ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                  {sv.exposed ? "on the gateway" : "off"}
                </span>
                <button
                  onClick={() => void toggleService(sv.id, !sv.exposed)}
                  title={sv.exposed ? `Hide the ${sv.id} service from external MCP clients` : `Expose the ${sv.id} service to external MCP clients`}
                  aria-label={`Turn the ${sv.id} service ${sv.exposed ? "off" : "on"}`}
                  className={cn("relative h-4.5 w-8 shrink-0 rounded-full transition-colors", sv.exposed ? "bg-primary" : "bg-secondary")}
                >
                  <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-[left]", sv.exposed ? "left-4" : "left-0.5")} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          External clients see exactly this list: connected databases with the services you left on (SQL, Text to SQL), plus
          Studio-level services like Dashboards. A saved connection that is not connected is reported to clients as
          unavailable until you connect it in the sidebar.
        </p>
      </section>

      {clients === null ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning for AI clients…
        </div>
      ) : (
        <>
          {[{ label: "Detected on this machine", list: detected, rescan: true }, { label: "Other supported clients", list: others, rescan: false }].map((grp) =>
            grp.list.length || grp.rescan ? (
              <section key={grp.label} className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{grp.label}</p>
                  {grp.rescan ? (
                    <button
                      onClick={() => void refresh()}
                      disabled={scanning}
                      className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      <RefreshCcw className={cn("h-3 w-3", scanning && "animate-spin")} /> {scanning ? "Scanning…" : "Rescan"}
                    </button>
                  ) : null}
                </div>
                {grp.rescan && !grp.list.length ? (
                  <p className="text-[12px] text-muted-foreground">No AI clients detected on this machine.</p>
                ) : null}
                {layout === "grid" ? (
                  <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    {grp.list.map((c) => (
                      <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-panel/50 p-3">
                        <div className="flex items-center gap-2">
                          <AiClientMark clientId={c.id} className={cn("h-6 w-6 shrink-0", c.connected ? "text-foreground" : "text-muted-foreground")} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{c.name}</span>
                          {badge(c)}
                        </div>
                        <p className="truncate font-mono text-[10.5px] text-muted-foreground" title={c.configPath}>{c.configPath}</p>
                        <div className="mt-auto flex items-center gap-1.5">{actions(c, true)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {grp.list.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-panel/50 px-3 py-2.5">
                        <span className="flex w-8 shrink-0 justify-center"><AiClientMark clientId={c.id} className={cn("h-6 w-6", c.connected ? "text-foreground" : "text-muted-foreground")} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-foreground">{c.name}</span>
                            {badge(c)}
                          </div>
                          <p className="truncate font-mono text-[10.5px] text-muted-foreground" title={c.configPath}>{c.configPath}</p>
                        </div>
                        <div className="flex w-[236px] shrink-0 items-center justify-end gap-1.5">{actions(c)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
