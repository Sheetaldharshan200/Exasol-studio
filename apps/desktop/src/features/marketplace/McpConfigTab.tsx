import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { agent } from "@/lib/agent-client";
import { MCP_PRESETS, type McpPreset } from "@/features/marketplace/mcp-presets";
import { ConnectorLogo } from "@/features/marketplace/ConnectorLogo";
import { cn } from "@/lib/utils";

/**
 * Full-page configuration tab for one MCP connector. Auth = environment
 * credentials (API tokens), per the MCP spec's pattern for local stdio
 * servers — with per-service guidance on creating a revocable token.
 */
function AuditView() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    agent.auditTail(200).then(setEvents).catch(() => undefined);
    const t = window.setInterval(() => agent.auditTail(200).then(setEvents).catch(() => undefined), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="h-full overflow-y-auto bg-editor">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-[18px] font-semibold text-foreground">Audit log</h1>
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          Every connector lifecycle change, external tool call (with your allow/deny), duration and errors — the
          machine-wide account of what touched the outside world. Newest last.
        </p>
        {events.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No events yet — connect an MCP server and make a call.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[11.5px]">
              <thead className="bg-secondary text-left">
                <tr>
                  {["time", "event", "target", "outcome"].map((h) => (
                    <th key={h} className="px-2.5 py-1.5 font-medium capitalize">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-2.5 py-1 text-muted-foreground">{String(e.ts ?? "").replace("T", " ").slice(0, 19)}</td>
                    <td className="px-2.5 py-1">{String(e.kind ?? "")}</td>
                    <td className="px-2.5 py-1">{[e.server ?? e.id ?? "", e.tool ?? ""].filter(Boolean).join(" → ")}</td>
                    <td className="px-2.5 py-1">
                      {e.denied ? <span className="text-warning">denied</span> : e.ok === false || e.error ? <span className="text-destructive">{String(e.error ?? "failed").slice(0, 60)}</span> : <span className="text-primary">ok{e.ms ? ` · ${e.ms}ms` : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function McpConfigTab({ presetId }: { presetId: string }) {
  if (presetId === "audit") return <AuditView />;
  const preset: McpPreset = MCP_PRESETS.find((p) => p.id === presetId) ?? MCP_PRESETS[MCP_PRESETS.length - 1];
  const isCustom = preset.id === "custom";
  const [envVals, setEnvVals] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState({ name: "", command: "", args: "", transport: "stdio" as "stdio" | "http", url: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState<{ toolCount: number; tools?: string[] } | null>(null);

  // Already connected? Show live status.
  useEffect(() => {
    agent
      .mcpList()
      .then((list) => {
        const hit = list.find((s) => s.name === preset.name && s.connected);
        if (hit) setConnected({ toolCount: hit.toolCount, tools: hit.tools });
      })
      .catch(() => undefined);
  }, [preset.name]);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const name = isCustom ? custom.name.trim() : preset.name;
      if (isCustom && custom.transport === "http") {
        // Remote MCP server — no local process, no Docker. Self-sustained.
        await agent.mcpAdd({
          name,
          transport: "http",
          url: custom.url.trim(),
          headers: custom.token.trim() ? { Authorization: `Bearer ${custom.token.trim()}` } : undefined,
        });
      } else {
        const command = isCustom ? custom.command.trim() : preset.command;
        const args = isCustom
          ? custom.args.trim().split(/\s+/).filter(Boolean)
          : [...preset.args, ...(preset.argInputs ?? []).map((a) => envVals[`arg:${a.key}`] ?? "")];
        const env = preset.env.length
          ? Object.fromEntries(preset.env.map((e) => [e.key, envVals[e.key] ?? ""]))
          : undefined;
        await agent.mcpAdd({ name, command, args, env });
      }
      const list = await agent.mcpList();
      const hit = list.find((s) => s.name === name);
      if (hit?.connected) setConnected({ toolCount: hit.toolCount, tools: hit.tools });
      else setErr("The server was saved but did not connect — check the credentials and command, then retry from the sidebar.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canConnect = isCustom
    ? custom.name.trim() && (custom.transport === "http" ? custom.url.trim() : custom.command.trim())
    : preset.env.every((e) => !e.secret || envVals[e.key]?.trim()) &&
      (preset.argInputs ?? []).every((a) => envVals[`arg:${a.key}`]?.trim());

  return (
    <div className="h-full overflow-y-auto bg-editor">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-1 flex items-center gap-2.5">
          <ConnectorLogo logo={preset.logo} className="h-9 w-9 rounded-lg" />
          <h1 className="text-[18px] font-semibold text-foreground">{preset.name}</h1>
        </div>
        <p className="mb-6 text-[13px] text-muted-foreground">{preset.desc}</p>

        {connected ? (
          <div className="mb-6 rounded-xl border border-primary/40 bg-primary/8 p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Connected — {connected.toolCount} tools available to the agent
            </div>
            {connected.tools?.length ? (
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                {connected.tools.map((t) => `\`${t}\``.replace(/`/g, "")).join(" · ")}
                {connected.toolCount > (connected.tools?.length ?? 0) ? " · …" : ""}
              </p>
            ) : null}
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Try it in the chat — e.g. “{preset.id === "jira" ? "pull my open Jira issues and load them into Exasol" : preset.id === "files" ? "list the CSV files in my Documents folder" : `use ${preset.name} to fetch data and load it into Exasol`}”. Every call asks your approval.
            </p>
          </div>
        ) : null}

        {isCustom ? (
          <section className="mb-6 space-y-3">
            {/* Transport: a self-contained remote URL, or a local command. */}
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {([["http", "Remote (URL)"], ["stdio", "Local (command)"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setCustom((c) => ({ ...c, transport: val }))}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                    custom.transport === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {custom.transport === "http"
                ? "Connects to a hosted MCP server over HTTP — nothing runs locally, no Docker or binaries needed."
                : "Runs an MCP server as a local process (needs the command available on this machine)."}
            </p>
            {(custom.transport === "http"
              ? ([
                  ["name", "Name", "My data source"],
                  ["url", "Server URL", "https://api.example.com/mcp/"],
                  ["token", "Access token (optional)", "sent as Authorization: Bearer …"],
                ] as const)
              : ([
                  ["name", "Name", "My data source"],
                  ["command", "Command", "npx | uvx | /path/to/binary"],
                  ["args", "Arguments (space-separated)", "-y some-mcp-server --flag"],
                ] as const)
            ).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <input
                  value={custom[k]}
                  type={k === "token" ? "password" : "text"}
                  onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))}
                  placeholder={ph}
                  className="h-9 w-full rounded-lg border border-border bg-panel px-3 font-mono text-[12.5px] outline-none"
                />
              </label>
            ))}
          </section>
        ) : (
          <>
            <section className="mb-6">
              <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Authentication
              </h2>
              {preset.env.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No credentials needed — this connector works with local resources only.</p>
              ) : (
                <>
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Uses a revocable API token (the standard for locally-running MCP servers — credentials stay on this
                    machine as environment variables and are never shown again after saving).
                    {preset.tokenHint ? ` ${preset.tokenHint}` : ""}
                  </p>
                  {preset.tokenUrl ? (
                    <a
                      href={preset.tokenUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-3 inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                    >
                      Create a token <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  <div className="space-y-3">
                    {preset.env.map((e) => (
                      <label key={e.key} className="block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{e.label}</span>
                        <input
                          value={envVals[e.key] ?? ""}
                          onChange={(ev) => setEnvVals((v) => ({ ...v, [e.key]: ev.target.value }))}
                          type={e.secret ? "password" : "text"}
                          placeholder={e.hint ?? ""}
                          className="h-9 w-full rounded-lg border border-border bg-panel px-3 text-[12.5px] outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </section>
            {preset.argInputs?.length ? (
              <section className="mb-6 space-y-3">
                {preset.argInputs.map((a) => (
                  <label key={a.key} className="block">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{a.label}</span>
                    <input
                      value={envVals[`arg:${a.key}`] ?? ""}
                      onChange={(ev) => setEnvVals((v) => ({ ...v, [`arg:${a.key}`]: ev.target.value }))}
                      type={a.secret ? "password" : "text"}
                      placeholder={a.hint ?? ""}
                      className="h-9 w-full rounded-lg border border-border bg-panel px-3 font-mono text-[12.5px] outline-none"
                    />
                  </label>
                ))}
              </section>
            ) : null}
            <section className="mb-6">
              <h2 className="mb-1 text-[13px] font-semibold text-foreground">Runs as</h2>
              <code className="block rounded-lg border border-border bg-panel px-3 py-2 font-mono text-[12px] text-muted-foreground">
                {preset.command} {preset.args.join(" ")}
              </code>
            </section>
          </>
        )}

        {err ? <p className="mb-3 text-[12px] text-destructive">{err}</p> : null}
        <button
          disabled={busy || !canConnect}
          onClick={() => void connect()}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground",
            "hover:bg-primary/85 disabled:opacity-50",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          {connected ? "Reconnect with new settings" : "Connect"}
        </button>
      </div>
    </div>
  );
}
