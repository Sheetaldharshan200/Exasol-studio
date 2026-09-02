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
  const [plugins, setPlugins] = useState<string[] | null>(null);
  const [mcp, setMcp] = useState<Record<string, { status: string }> | null>(null);
  const [appControl, setAppControl] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    agent.getSettings().then((r) => setAppControl(r.settings.appControl !== false)).catch(() => setAppControl(true));
    ipc.engineOptionsGet()
      .then((o) => {
        setTools(new Set(o.tools));
        // Plugin specs are npm names ("pkg@1.2.3") or file paths/URLs.
        setPlugins(
          (o.plugins ?? []).map((p) => (typeof p === "string" ? p : Array.isArray(p) ? String(p[0]) : String(p))),
        );
        // First run seeded the Tasks default — rebuild the engine instance so
        // it binds without waiting for a manual toggle.
        if (o.seeded) window.dispatchEvent(new Event("exa:tools-changed"));
      })
      .catch(() => {
        setTools(new Set());
        setPlugins([]);
      });
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

  const toggleAppControl = (on: boolean) => {
    setAppControl(on);
    setError(null);
    void agent
      .setSettings({ appControl: on })
      .then(() => window.dispatchEvent(new CustomEvent("exa:app-control-changed", { detail: { on } })))
      .catch((e) => { setAppControl(!on); setError(String(e)); });
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground/80">App control</h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Let the assistant drive Studio directly — open views, search, and install / uninstall / verify components — instead of only telling you what to click.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-foreground">Assistant can control the app</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">On by default. It still asks before installing anything. Turn off to make the assistant advise only.</p>
          </div>
          <Switch checked={appControl ?? true} disabled={appControl === null} onCheckedChange={toggleAppControl} aria-label="Assistant app control" />
        </div>
      </section>

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

      <section>
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-foreground/80">
          <Icon name="extension" className="h-3.5 w-3.5" /> Plugins
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Engine plugins extend the assistant with custom hooks and tools — published on npm or dropped in as local files.
        </p>
        <div className="mt-3 rounded-xl border border-border">
          {plugins === null ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : plugins.length === 0 ? (
            <div className="px-3 py-4">
              <p className="text-[12px] font-medium text-foreground">No plugins installed yet</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                A plugin is an npm package (or a single .ts/.js file) exporting engine hooks — install one by adding it
                to the engine config's <span className="font-mono">plugin</span> list, or drop the file into the
                engine's <span className="font-mono">plugins/</span> folder. The guide covers both, plus publishing
                your own to npm.
              </p>
              <button
                onClick={() => {
                  // Settings runs in its OWN WebviewWindow on desktop — a DOM
                  // event never reaches the main window. Emit app-wide via
                  // Tauri and bring the main window forward; the DOM dispatch
                  // covers the web build's in-app settings modal.
                  window.dispatchEvent(new CustomEvent("studio:open-docs", { detail: { path: "exa/develop/plugins" } }));
                  if (isTauri()) {
                    void (async () => {
                      const { emit } = await import("@tauri-apps/api/event");
                      await emit("studio:open-docs", { path: "exa/develop/plugins" });
                      const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
                      const main = (await getAllWebviewWindows()).find((w) => w.label !== "settings");
                      await main?.setFocus();
                    })().catch(() => undefined);
                  }
                }}
                className="mt-2.5 flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon name="guides" className="h-3.5 w-3.5" /> How to create &amp; add a plugin
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {plugins.map((p) => (
                <div key={p} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon name="extension" className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{p}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
    </div>
  );
}
