import { useEffect, useState } from "react";
import { PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { agent } from "@/lib/agent-client";
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
    { id: string; name: string; command: string; args: string[]; connected: boolean; toolCount: number }[]
  >([]);
  const refresh = () => agent.mcpList().then(setServers).catch(() => undefined);
  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="p-3">
      <div className="mb-1 flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold text-foreground">Connect external tools</h2>
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground">
        Their tools join the AI agent — every call asks your approval — so external data can land straight in Exasol.
        Type <code className="rounded bg-secondary px-1">/mcp</code> in the chat for live status.
      </p>

      {servers.length > 0 ? (
        <div className="mb-4 space-y-1.5">
          {servers.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-panel/60 px-2.5 py-2">
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
                title="Reconnect"
                onClick={() => void agent.mcpReconnect(s.id).then(refresh)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                title="Remove"
                onClick={() => void agent.mcpRemove(s.id).then(refresh)}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <button
        onClick={() => onOpenConfig?.("audit", "Audit log")}
        className="mb-3 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        View audit log →
      </button>

      <div className="grid gap-1.5">
        {MCP_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenConfig?.(p.id, p.name)}
            title={p.desc}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-panel/60 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-panel"
          >
            <ConnectorLogo logo={p.logo} />
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground">{p.name}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{p.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
