import { useEffect, useState } from "react";
import { Check, Loader2, Plug, RefreshCw, X } from "lucide-react";
import { agent, type EngineMcpConfig } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * /mcp — the agent's MCP server configuration, engine-side: opencode owns the
 * servers (GET/POST /mcp, connect/disconnect), so anything added here becomes
 * tools the agent can call. Rendered as an overlay inside the Exa thread.
 */
export function ExaMcpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [servers, setServers] = useState<Record<string, { status: string }> | "loading" | "error">("loading");
  const [busyName, setBusyName] = useState<string | null>(null);
  // Add form
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [target, setTarget] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  async function add() {
    const n = name.trim();
    const t = target.trim();
    if (!n || !t) return;
    setAdding(true);
    setAddError(null);
    const config: EngineMcpConfig =
      kind === "remote" ? { type: "remote", url: t, enabled: true } : { type: "local", command: t.split(/\s+/), enabled: true };
    try {
      await agent.engine.mcpAdd(n, config);
      setName("");
      setTarget("");
      refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add the server.");
    } finally {
      setAdding(false);
    }
  }

  const statusTone = (s: string) =>
    s === "connected" ? "bg-foreground/80" : s === "failed" ? "bg-destructive" : "bg-muted-foreground/50";

  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div className="absolute left-1/2 top-10 z-40 flex max-h-[75%] w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 flex-col rounded-xl border border-border bg-popover shadow-xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Plug className="size-4 text-muted-foreground" />
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
          {servers === "loading" ? (
            <p className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading servers…
            </p>
          ) : servers === "error" ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">The engine isn't running — install/start it first.</p>
          ) : Object.keys(servers).length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">No MCP servers yet — add one below.</p>
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

        {/* Add a server: remote URL or local command. */}
        <div className="shrink-0 border-t border-border p-2" onKeyDown={(e) => e.stopPropagation()}>
          <div className="mb-1.5 flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. exasol)"
              className="h-7 w-32 rounded-md border border-border bg-background px-2 text-[11.5px] outline-none focus:border-ring"
            />
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["remote", "local"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn("px-2 py-1 text-[11px]", kind === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder={kind === "remote" ? "https://host/mcp" : "npx -y @exasol/mcp-server"}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={!name.trim() || !target.trim() || adding}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-foreground px-2.5 text-[11px] font-medium text-background disabled:opacity-50"
            >
              {adding ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Add
            </button>
          </div>
          {addError ? <p className="mt-1 text-[11px] text-destructive">{addError}</p> : null}
        </div>
      </div>
    </>
  );
}
