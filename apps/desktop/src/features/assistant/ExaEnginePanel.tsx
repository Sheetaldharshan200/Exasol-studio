import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Send, Square, Terminal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { agent, type AgentProviderInfo, type EngineEvent, type EngineStatus } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
import { BrandLoader } from "@/components/brand/BrandLoader";

/**
 * Exa engine (v2, opencode) chat panel — the continue.dev interaction grammar
 * on Studio's own components, driven entirely by /v1/engine/* + the engine-event
 * stream. When the engine component isn't installed it shows the install gate
 * (the correct first-run state); once running it is a full session chat with
 * live tool-call cards, interruption, and per-turn model selection.
 *
 * The engine binary is the opencode Marketplace component; this tag is the
 * baseline the Managed Components / Updates flow moves forward.
 */
const ENGINE_TAG = "v1.18.12";

type ChatMsg = { role: "user" | "assistant"; text: string };
type ToolCard = { callId: string; name: string; args: unknown; ok?: boolean; result?: unknown };

export function ExaEnginePanel() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(false);
  const [cliBusy, setCliBusy] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<{ providerID: string; modelID: string; label: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const disposer = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(() => {
    agent.engine.status().then(setStatus).catch(() => setStatus(null));
    ipc.engineCliStatus().then((s) => setCliInstalled(s.installed)).catch(() => undefined);
  }, []);
  useEffect(() => refreshStatus(), [refreshStatus]);

  // The AI providers/models available here — the SAME ranked set Studio
  // supports (Local Runtime → In-DB AI → cloud). opencode drives whichever the
  // user picks.
  useEffect(() => {
    agent
      .models()
      .then(({ providers: ps, defaultModel }) => {
        setProviders(ps);
        // Default to the first usable ranked model (local-first).
        const first = ps.find((p) => p.models.length > 0);
        if (defaultModel) {
          const [pid, ...rest] = defaultModel.split("/");
          setModel({ providerID: pid, modelID: rest.join("/"), label: defaultModel });
        } else if (first) {
          setModel({ providerID: first.id, modelID: first.models[0].id, label: `${first.name} · ${first.models[0].name}` });
        }
      })
      .catch(() => undefined);
  }, []);

  async function installCli() {
    setCliBusy(true);
    try {
      const s = await ipc.engineInstallCli();
      setCliInstalled(s.installed);
    } finally {
      setCliBusy(false);
    }
  }

  // Live event stream → messages + tool cards.
  useEffect(() => {
    let alive = true;
    agent.engine
      .stream((e: EngineEvent) => {
        if (!alive) return;
        if (e.type === "message.delta") {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role === "assistant") return [...m.slice(0, -1), { ...last, text: last.text + e.text }];
            return [...m, { role: "assistant", text: e.text }];
          });
        } else if (e.type === "tool.start") {
          setTools((t) => [...t, { callId: e.callId, name: e.name, args: e.args }]);
        } else if (e.type === "tool.result") {
          setTools((t) => t.map((c) => (c.callId === e.callId ? { ...c, ok: e.ok, result: e.result } : c)));
        } else if (e.type === "session.idle" || e.type === "message.done") {
          setBusy(false);
        } else if (e.type === "error") {
          setMessages((m) => [...m, { role: "assistant", text: `⚠︎ ${e.message}` }]);
          setBusy(false);
        }
      })
      .then((d) => (disposer.current = d))
      .catch(() => undefined);
    return () => {
      alive = false;
      disposer.current?.();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, tools]);

  async function install() {
    setInstalling(true);
    try {
      await ipc.engineInstall(ENGINE_TAG);
      refreshStatus();
    } finally {
      setInstalling(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    setTools([]);
    setBusy(true);
    try {
      let sid = sessionId;
      if (!sid) {
        sid = (await agent.engine.createSession()).id;
        setSessionId(sid);
      }
      await agent.engine.prompt(sid, text, model ? { providerID: model.providerID, modelID: model.modelID } : undefined);
    } catch {
      setBusy(false);
    }
  }

  async function stop() {
    if (sessionId) await agent.engine.abort(sessionId).catch(() => undefined);
    setBusy(false);
  }

  // ── Install gate (not provisioned / binary absent) ──
  if (!status || (!status.provisioned && !installing) || (status.provisioned && !status.binaryPresent && !installing)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel px-8 text-center">
        <BrandLoader size={44} />
        <div>
          <p className="text-[14px] font-semibold text-foreground">Exa engine isn't installed yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
            Exa runs on the open-source opencode engine (MIT), fetched from its GitHub Releases and run locally. Install it
            once — it updates independently from Managed Components.
          </p>
        </div>
        <button
          onClick={() => void install()}
          disabled={installing}
          className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
        >
          {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {installing ? "Installing…" : `Install Exa engine (${ENGINE_TAG})`}
        </button>
        {status?.reason ? <p className="max-w-md font-mono text-[11px] text-muted-foreground">{status.reason}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[12px]">
        <BrandLoader size={16} />
        <span className="font-semibold text-foreground">Exa</span>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
          Beta
        </span>
        <button
          onClick={() => void installCli()}
          disabled={cliBusy}
          title={cliInstalled ? "exa CLI is on your PATH — click to refresh" : "Install the exa terminal command to your PATH"}
          className={cn(
            "ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] transition-colors",
            cliInstalled ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Terminal className="h-3 w-3" /> {cliBusy ? "…" : cliInstalled ? "exa CLI ✓" : "Install exa CLI"}
        </button>
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            title="Choose the model — Local Runtime, In-DB AI, or a cloud provider"
            className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {model ? model.label.length > 28 ? model.label.slice(0, 28) + "…" : model.label : "Pick a model"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {pickerOpen ? (
            <div className="absolute right-0 top-7 z-50 max-h-80 w-72 overflow-auto rounded-md border border-border bg-panel shadow-xl [scrollbar-width:thin]">
              {providers.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">No providers detected. Run Ollama/LM Studio locally, or add a provider in AI Settings.</div>
              ) : null}
              {providers.map((p) => (
                <div key={p.id}>
                  <div className="sticky top-0 flex items-center gap-1.5 bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {p.name}
                    <span className={cn("rounded-full px-1 text-[8.5px]", p.kind === "local" ? "bg-primary/15 text-primary" : p.id === "in-database" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                      {p.id === "in-database" ? "in-db" : p.kind}
                    </span>
                    {p.kind === "cloud" && !p.configured ? <span className="text-[9px] text-muted-foreground">needs key</span> : null}
                  </div>
                  {p.models.length === 0 ? (
                    <div className="px-3 py-1 text-[11px] text-muted-foreground/70">{p.installedOnly ? "server not running" : "no models"}</div>
                  ) : null}
                  {p.models.map((m) => {
                    const ref = `${p.id}/${m.id}`;
                    const active = model?.providerID === p.id && model?.modelID === m.id;
                    return (
                      <button
                        key={ref}
                        onClick={() => {
                          setModel({ providerID: p.id, modelID: m.id, label: `${p.name} · ${m.name}` });
                          setPickerOpen(false);
                        }}
                        className={cn("block w-full truncate px-3 py-1.5 text-left font-mono text-[11.5px] hover:bg-secondary", active ? "text-primary" : "text-foreground")}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          engine {status.state}
          {installing ? " · installing…" : ""}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3 [scrollbar-width:thin]">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-[12.5px] text-muted-foreground">Ask Exa about your database, grounded in its schema.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cn("max-w-[92%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed", m.role === "user" ? "ml-auto bg-secondary text-foreground" : "bg-editor text-foreground")}>
            <div className="whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
        {tools.map((t) => (
          <div key={t.callId} className="rounded-md border border-border bg-editor px-2.5 py-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {t.ok === undefined ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wrench className={cn("h-3 w-3", t.ok ? "text-primary" : "text-destructive")} />}
              {t.name}
            </div>
          </div>
        ))}
        {busy && tools.length === 0 && messages[messages.length - 1]?.role === "user" ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> thinking…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Message Exa…  (Enter to send)"
            className="min-h-9 flex-1 resize-none rounded-md border border-border bg-editor px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/50"
          />
          {busy ? (
            <button onClick={() => void stop()} title="Stop" className="flex h-9 w-9 items-center justify-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={() => void send()} disabled={!draft.trim()} title="Send" className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
