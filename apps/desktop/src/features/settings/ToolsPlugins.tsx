import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { McpMark } from "@/components/brand/McpMark";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { agent } from "@/lib/agent-client";
import { ipc, isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Settings → AI → Tools & Plugins: every capability the assistant can hold is
 * a switch here — the engine's tool groups (persisted in the same store
 * `exa tools grant` writes, enforced at the permission layer) and each
 * connected MCP server (runtime connect/disconnect).
 */

const TOOL_GROUPS: { id: string; label: string; help: string }[] = [
  { id: "files", label: "Files", help: "Read and edit local files (read, edit)." },
  {
    id: "shell",
    label: "Terminal",
    help: "Run commands — exapump data loads use this. Auto-enables while the shield grants write classes; data changes still follow the shield.",
  },
  { id: "search", label: "Search", help: "Find things in the workspace (grep, glob, list)." },
  { id: "tasks", label: "Tasks", help: "Plan multi-step work (todo lists, subtasks)." },
];

export function ToolsPlugins() {
  const [tools, setTools] = useState<Set<string> | null>(null);
  const [mcp, setMcp] = useState<Record<string, { status: string }> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    ipc.engineOptionsGet()
      .then((o) => setTools(new Set(o.tools)))
      .catch(() => setTools(new Set()));
    agent.engine
      .mcp()
      .then((r) => setMcp(r.servers))
      .catch(() => setMcp({}));
  };
  useEffect(load, []);

  const toggleTool = (id: string) => {
    if (!tools) return;
    const next = new Set(tools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTools(next);
    setError(null);
    ipc.engineToolsSync([...next])
      .then(() => window.dispatchEvent(new Event("exa:tools-changed")))
      .catch((e) => {
        setTools(tools); // revert — the store write failed
        setError(String(e));
      });
  };

  const toggleMcp = async (name: string, connect: boolean) => {
    setBusy(name);
    setError(null);
    try {
      await agent.engine.mcpToggle(name, connect);
      const r = await agent.engine.mcp();
      setMcp(r.servers);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!isTauri()) {
    return <p className="text-[12px] text-muted-foreground">Tool and plugin management needs the desktop app.</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground/80">Agent tools</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Capabilities the assistant may use on this machine. Off = the engine denies the tool entirely.
        </p>
        <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border">
          {TOOL_GROUPS.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-foreground">{g.label}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{g.help}</p>
              </div>
              <Switch
                checked={tools?.has(g.id) ?? false}
                disabled={tools === null}
                onCheckedChange={() => toggleTool(g.id)}
                aria-label={`${g.label} tool group`}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-foreground/80">
              <McpMark className="h-3.5 w-3.5" /> MCP servers
            </h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Connections the assistant can query. Toggling connects or disconnects the server for this engine.
            </p>
          </div>
          <button
            onClick={load}
            title="Refresh"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border">
          {mcp === null ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : Object.keys(mcp).length === 0 ? (
            <p className="px-3 py-4 text-[11.5px] text-muted-foreground">
              No MCP servers yet — add one from the MCP panel in the activity rail.
            </p>
          ) : (
            Object.entries(mcp).map(([name, s]) => {
              const connected = s.status === "connected";
              return (
                <div key={name} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon name="mcp" className={cn("h-4 w-4 shrink-0", connected ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.status}</p>
                  </div>
                  {busy === name ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={connected}
                      onCheckedChange={(on) => void toggleMcp(name, on)}
                      aria-label={`${name} MCP server`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
    </div>
  );
}
