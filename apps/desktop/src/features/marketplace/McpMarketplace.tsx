import { useEffect, useState } from "react";
import { ChevronRight, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { agent } from "@/lib/agent-client";
import { McpMark } from "@/components/brand/McpMark";
import { MCP_PRESETS } from "@/features/marketplace/mcp-presets";
import { ConnectorLogo } from "@/features/marketplace/ConnectorLogo";
import { cn } from "@/lib/utils";

/**
 * MCP sidebar panel: connected servers + connector launcher. Clicking a
 * connector opens a full CONFIGURATION TAB in the workspace (auth guidance,
 * credentials, connect) — this panel stays a compact overview.
 */
export function McpMarketplace({ onOpenConfig }: { onOpenConfig?: (presetId: string, presetName: string) => void }) {
  const [servers, setServers] = useState<
    { id: string; name: string; command?: string; args?: string[]; connected: boolean; toolCount: number }[]
  >([]);
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  const refresh = () => agent.mcpList().then(setServers).catch(() => undefined);
  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Once a connector is configured it moves up to the active list — so hide it
  // from "Connectors" (the add-new launcher). "custom" always stays so you can
  // add more one-off servers.
  const configured = new Set(servers.map((s) => s.name));
  const presetIdFor = (name: string) => MCP_PRESETS.find((p) => p.name === name)?.id ?? "custom";
  const availablePresets = MCP_PRESETS.filter((p) => p.id === "custom" || !configured.has(p.name));

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mb-1 flex items-center gap-2">
        <McpMark className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-[13px] font-semibold text-foreground">Connect external tools</h2>
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground">
        Their tools join the AI agent — every call asks your approval — so external data can land straight in Exasol.
        Type <code className="rounded bg-secondary px-1">/mcp</code> in the chat for live status.
      </p>

      {servers.length > 0 ? (
        <div className="mb-4 space-y-1">
          {servers.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2">
              <span className="relative shrink-0">
                <ConnectorLogo logo={MCP_PRESETS.find((p) => p.name === s.name)?.logo} className="h-6 w-6" />
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-panel",
                    s.connected ? "bg-primary" : "bg-destructive/70",
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground">{s.name}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">
                  {s.connected ? `${s.toolCount} tools` : "disconnected"}
                </div>
              </div>
              <button
                title="Edit configuration"
                onClick={() => onOpenConfig?.(presetIdFor(s.name), s.name)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                title={s.connected ? "Reconnect" : "Connect"}
                disabled={reconnecting[s.id]}
                onClick={() => {
                  setReconnecting((r) => ({ ...r, [s.id]: true }));
                  void agent
                    .mcpReconnect(s.id)
                    .then(refresh)
                    .finally(() => setReconnecting((r) => ({ ...r, [s.id]: false })));
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-70"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", reconnecting[s.id] && "animate-spin text-primary")} />
              </button>
              <button
                title="Remove"
                onClick={() => void agent.mcpRemove(s.id).then(refresh)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <button
        onClick={() => onOpenConfig?.("audit", "Audit log")}
        className="mb-3 self-start text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        View audit log
      </button>

      <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        Connectors
      </p>
      <div className="grid gap-1">
        {availablePresets.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenConfig?.(p.id, p.name)}
            title={p.desc}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-secondary/50"
          >
            <ConnectorLogo logo={p.logo} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-foreground">{p.name}</div>
              {/* Clamp to 2 lines and never let it push the panel wider. */}
              <div className="line-clamp-2 break-words text-[10.5px] leading-snug text-muted-foreground">{p.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50 transition-colors group-hover:text-primary" />
          </button>
        ))}
      </div>
    </section>
  );
}
