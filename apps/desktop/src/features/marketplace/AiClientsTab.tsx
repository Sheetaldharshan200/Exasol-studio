import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Plug, RefreshCcw, Unplug } from "lucide-react";
import { AiClientMark } from "@/features/marketplace/ai-client-marks";
import { errorMessage, ipc, type AiClientStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Marketplace → AI clients: connect OTHER AI apps (Claude, Codex, Cursor, …)
 * to this machine's Exasol via the bundled read-only MCP server — the Studio
 * equivalent of the starter kit's `exakit mcp-setup`. Deliberately separate
 * from the in-app agent's connectors (which bring tools INTO the Studio agent).
 */
export function AiClientsTab() {
  const [clients, setClients] = useState<AiClientStatus[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const refresh = async () => {
    setScanning(true);
    try {
      setClients(await ipc.listAiClients());
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

  return (
    <div className="max-w-3xl">
      <div className="mb-4 rounded-lg border border-border bg-panel/50 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Use your Exasol from other AI clients.</span> One click writes the
          bundled <span className="font-mono text-[11px]">exasol-mcp-server</span> into the client's own MCP config (a backup
          is kept) using Studio's dedicated <span className="font-mono text-[11px]">STUDIO_MCP_*</span> user — the database
          enforces it is <span className="font-medium text-foreground">read-only</span>. Restart the client afterwards.
        </p>
        <p className="mt-1.5">
          This is separate from the <span className="font-medium text-foreground">MCP connectors</span> panel, which brings
          external tools <em>into</em> the Studio agent. Here, your database goes <em>out</em> to other clients.
        </p>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
      ) : null}

      {clients === null ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning for AI clients…
        </div>
      ) : (
        <>
          {[{ label: "Detected on this machine", list: detected }, { label: "Other supported clients", list: others }].map((grp) =>
            grp.list.length ? (
              <section key={grp.label} className="mb-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{grp.label}</p>
                <div className="space-y-1.5">
                  {grp.list.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-panel/50 px-3 py-2.5">
                      <AiClientMark clientId={c.id} className={cn("h-6 w-6 shrink-0", c.connected ? "text-foreground" : "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-foreground">{c.name}</span>
                          {c.connected ? (
                            <span className="flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
                              <Check className="h-2.5 w-2.5" /> connected
                            </span>
                          ) : c.detected ? (
                            <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium uppercase text-muted-foreground">detected</span>
                          ) : null}
                        </div>
                        <p className="truncate font-mono text-[10.5px] text-muted-foreground" title={c.configPath}>{c.configPath}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => void copySnippet(c)}
                          title="Copy the exasol MCP entry for this client's config"
                          className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          {copied === c.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />} Snippet
                        </button>
                        {c.auto ? (
                          c.connected ? (
                            <button
                              onClick={() => void act(c, () => ipc.disconnectAiClient(c.id))}
                              disabled={busy[c.id]}
                              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            >
                              {busy[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Disconnect
                            </button>
                          ) : (
                            <button
                              onClick={() => void act(c, () => ipc.connectAiClient(c.id))}
                              disabled={busy[c.id]}
                              className="cta-glow flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                            >
                              {busy[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Connect
                            </button>
                          )
                        ) : (
                          <span className="text-[10.5px] text-muted-foreground">manual config</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )}
          <button
            onClick={() => void refresh()}
            disabled={scanning}
            className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
          >
            <RefreshCcw className={cn("h-3 w-3", scanning && "animate-spin")} /> {scanning ? "Scanning…" : "Rescan"}
          </button>
        </>
      )}
    </div>
  );
}
