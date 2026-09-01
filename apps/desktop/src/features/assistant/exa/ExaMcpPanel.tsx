import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { McpMark } from "@/components/brand/McpMark";
import { agent } from "@/lib/agent-client";
import { MCP_PRESETS } from "@/features/marketplace/mcp-presets";
import { ConnectorLogo } from "@/features/marketplace/ConnectorLogo";
import { cn } from "@/lib/utils";

/**
 * /mcp — a compact STATUS view of the engine's MCP servers (what's there and
 * whether it's running), rendered as an overlay inside the Exa thread.
 * Adding/configuring happens in a full workspace tab (single-click connector
 * presets with auth guidance) — the launcher grid below opens it per
 * connector, targeted at the ENGINE's registry.
 */
export function ExaMcpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [servers, setServers] = useState<Record<string, { status: string }> | "loading" | "error">("loading");
  const [busyName, setBusyName] = useState<string | null>(null);

  const refresh = () => {
    agent.engine
      .mcp()
      .then((r) => setServers(r.servers))
      .catch(() => setServers("error"));
  };
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  async function toggle(n: string, connect: boolean) {
    setBusyName(n);
    try {
      await agent.engine.mcpToggle(n, connect);
      refresh();
    } finally {
      setBusyName(null);
    }
  }

  /** Open the full configuration tab for a connector (or the custom form). */
  function configure(presetId: string, presetName: string) {
    window.dispatchEvent(
      new CustomEvent("studio:open-mcp-config", { detail: { presetId, presetName, target: "exa" } }),
    );
    onClose();
  }

  const statusTone = (s: string) =>
    s === "connected" ? "bg-primary" : s === "failed" ? "bg-destructive" : "bg-muted-foreground/50";
  const configured = servers === "loading" || servers === "error" ? new Set<string>() : new Set(Object.keys(servers));
  const launchable = MCP_PRESETS.filter((p) => p.id === "custom" || !configured.has(p.name));

  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div className="absolute left-1/2 top-10 z-40 flex max-h-[75%] w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 flex-col rounded-xl border border-border bg-popover shadow-xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <McpMark className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">MCP servers</span>
          <span className="text-[11px] text-muted-foreground">tools for the agent</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button type="button" title="Refresh" onClick={refresh} className="hover:bg-muted flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
              <RefreshCw className="size-3.5" />
            </button>
            <button type="button" title="Close" onClick={onClose} className="hover:bg-muted flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* What's there and whether it's running. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
          {servers === "loading" ? (
            <p className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading servers…
            </p>
          ) : servers === "error" ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">The engine isn't running — open a chat first, then retry.</p>
          ) : Object.keys(servers).length === 0 ? (
            <p className="py-2 text-center text-[12px] text-muted-foreground">No MCP servers yet — add one below.</p>
          ) : (
            Object.entries(servers).map(([n, s]) => {
              const connected = s.status === "connected";
              return (
                <div key={n} className="hover:bg-muted/60 flex items-center gap-2 rounded-md px-2 py-1.5">
                  <span className={cn("size-1.5 shrink-0 rounded-full", statusTone(s.status))} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{n}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">{s.status}</span>
                  <button
                    type="button"
                    disabled={busyName === n}
                    onClick={() => void toggle(n, !connected)}
                    className="hover:bg-muted flex h-6 shrink-0 items-center rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {busyName === n ? <Loader2 className="size-3 animate-spin" /> : connected ? "Disconnect" : "Connect"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Connector launcher: one click opens the full config tab (auth
            guidance + single-click connect) targeted at the engine. */}
        <div className="shrink-0 border-t border-border p-2">
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add a connector</p>
          <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto pb-0.5 [scrollbar-width:thin]">
            {launchable.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => configure(p.id, p.name)}
                title={p.desc}
                className="hover:bg-muted/60 flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-left"
              >
                {p.id === "custom" ? (
                  <Plus className="size-5 shrink-0 rounded-md border border-dashed border-border p-0.5 text-muted-foreground" />
                ) : (
                  <ConnectorLogo logo={p.logo} className="size-5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
