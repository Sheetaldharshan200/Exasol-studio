import { useEffect, useState } from "react";
import { Plug, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { agent } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * MCP marketplace: connect external MCP servers (Jira, Excel, filesystem, …)
 * — their tools bridge into the AI agent, every call approval-gated, so
 * external data can flow into Exasol through one conversation.
 */

type McpServer = {
  id: string;
  name: string;
  command: string;
  args: string[];
  connected: boolean;
  toolCount: number;
};

/** Curated, verified servers — command presets the user completes with creds. */
const CURATED: { name: string; desc: string; command: string; args: string[]; env: string[] }[] = [
  {
    name: "Jira & Confluence",
    desc: "Search and read issues, pages, sprints — then land them in Exasol",
    command: "uvx",
    args: ["mcp-atlassian"],
    env: ["JIRA_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"],
  },
  {
    name: "Excel workbooks",
    desc: "Read/write .xlsx files — sheets straight into tables",
    command: "uvx",
    args: ["excel-mcp-server", "stdio"],
    env: [],
  },
  {
    name: "Local files",
    desc: "Read files and folders (CSV, JSON, logs) for the agent to import",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"],
    env: [],
  },
  {
    name: "GitHub",
    desc: "Repos, issues, PRs — analyze engineering data in Exasol",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
];

export function McpMarketplace() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [adding, setAdding] = useState<(typeof CURATED)[number] | null>(null);
  const [envVals, setEnvVals] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ name: "", command: "", args: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => agent.mcpList().then(setServers).catch(() => undefined);
  useEffect(() => {
    void refresh();
  }, []);

  async function connect(name: string, command: string, args: string[], env?: Record<string, string>) {
    setBusy(true);
    setErr(null);
    try {
      await agent.mcpAdd({ name, command, args, env });
      setAdding(null);
      setCustom(false);
      setEnvVals({});
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-3">
      <div className="mb-1 flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold text-foreground">Connect external tools</h2>
      </div>
      <p className="mb-3 max-w-2xl text-[12px] text-muted-foreground">
        Connect external MCP servers — Jira, Excel, files, GitHub, or any custom one. Their tools join the AI agent
        (every call asks your approval), so you can say things like “pull my open Jira issues and load them into
        Exasol”.
      </p>

      {servers.length > 0 ? (
        <div className="mb-4 space-y-1.5">
          {servers.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-panel/60 px-3 py-2">
              <span className={cn("h-2 w-2 rounded-full", s.connected ? "bg-primary" : "bg-destructive/70")} />
              <span className="text-[12.5px] font-medium text-foreground">{s.name}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {s.command} {s.args.join(" ")}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {s.connected ? `${s.toolCount} tools` : "disconnected"}
              </span>
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

      <div className="grid gap-2">
        {CURATED.map((c) => (
          <div key={c.name} className="flex flex-col rounded-xl border border-border bg-panel/60 p-3">
            <span className="text-[13px] font-semibold text-foreground">{c.name}</span>
            <span className="mt-0.5 flex-1 text-[11.5px] text-muted-foreground">{c.desc}</span>
            <button
              onClick={() => {
                setAdding(c);
                setEnvVals({});
                setErr(null);
              }}
              className="mt-2 flex h-7 items-center justify-center gap-1 rounded-md border border-border text-[11.5px] text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              <Plug className="h-3 w-3" /> Connect
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setCustom((v) => !v)} className="mt-2 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        + Add a custom MCP server
      </button>

      {adding ? (
        <div className="mt-3 max-w-md rounded-xl border border-border bg-popover p-3">
          <p className="mb-2 text-[12.5px] font-medium text-foreground">Connect {adding.name}</p>
          {adding.env.map((k) => (
            <label key={k} className="mb-2 block">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</span>
              <input
                value={envVals[k] ?? ""}
                onChange={(e) => setEnvVals((v) => ({ ...v, [k]: e.target.value }))}
                type={/TOKEN|PASSWORD|SECRET/i.test(k) ? "password" : "text"}
                className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none"
              />
            </label>
          ))}
          {adding.env.length === 0 ? (
            <p className="mb-2 text-[11.5px] text-muted-foreground">No credentials needed — connects directly.</p>
          ) : null}
          {err ? <p className="mb-2 text-[11px] text-destructive">{err}</p> : null}
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setAdding(null)} className="h-7 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground">
              Cancel
            </button>
            <button
              disabled={busy || adding.env.some((k) => !envVals[k]?.trim())}
              onClick={() => void connect(adding.name, adding.command, adding.args, adding.env.length ? envVals : undefined)}
              className="h-7 rounded-md bg-primary px-3 text-[11.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      ) : null}

      {custom ? (
        <div className="mt-3 max-w-md rounded-xl border border-border bg-popover p-3">
          <p className="mb-2 text-[12.5px] font-medium text-foreground">Custom MCP server (stdio)</p>
          {(["name", "command", "args"] as const).map((k) => (
            <label key={k} className="mb-2 block">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {k === "args" ? "Arguments (space-separated)" : k}
              </span>
              <input
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                placeholder={k === "command" ? "npx | uvx | /path/to/bin" : ""}
                className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 font-mono text-[12px] outline-none"
              />
            </label>
          ))}
          {err ? <p className="mb-2 text-[11px] text-destructive">{err}</p> : null}
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setCustom(false)} className="h-7 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground">
              Cancel
            </button>
            <button
              disabled={busy || !form.name.trim() || !form.command.trim()}
              onClick={() => void connect(form.name.trim(), form.command.trim(), form.args.trim().split(/\s+/).filter(Boolean))}
              className="h-7 rounded-md bg-primary px-3 text-[11.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
