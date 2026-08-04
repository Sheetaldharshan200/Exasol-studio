import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Terminal, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { agent, type AgentProviderInfo, type EngineEvent, type EngineStatus } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
import { AgentMark } from "@/components/studio/AgentMark";
import { emptyCatalog } from "@/lib/sql-completion";
import { ChatMarkdown } from "./exa/ChatMarkdown";
import { ChatComposer, type ChatMode, type ContextChip } from "./exa/ChatComposer";
import { buildPrompt, type ExaSnapshot } from "./exa/context";
import type { PickedModel } from "./exa/ModelMenu";

/**
 * Exa engine (v2, opencode) chat panel — the continue.dev interaction grammar
 * on Studio's own components, driven entirely by /v1/engine/* + the engine-event
 * stream. When the engine component isn't installed it shows the install gate
 * (the correct first-run state); once running it is a full session chat with
 * markdown replies, live tool-call cards, `@`-context, interruption, and an
 * inline model selector in the composer.
 *
 * The engine binary is the opencode Marketplace component; this tag is the
 * baseline the Managed Components / Updates flow moves forward.
 */
const ENGINE_TAG = "v1.18.12";

type ChatMsg = { role: "user" | "assistant"; text: string };
type ToolCard = { callId: string; name: string; args: unknown; ok?: boolean; result?: unknown };

const EMPTY_SNAPSHOT: ExaSnapshot = {
  schemas: [],
  catalog: emptyCatalog(),
  editorSql: "",
  lastResult: null,
  history: [],
};

export function ExaEnginePanel({
  onClose,
  onExpand,
  onCollapse,
  getSnapshot,
  onApplySql,
}: {
  onClose?: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  /** Live view of the workbench (schema/SQL/results) for `@` context. */
  getSnapshot?: () => ExaSnapshot;
  /** Apply a SQL code block from a reply into the editor. */
  onApplySql?: (sql: string) => void;
} = {}) {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(false);
  const [cliBusy, setCliBusy] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<PickedModel | null>(null);
  const disposer = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(() => {
    agent.engine.status().then(setStatus).catch(() => setStatus(null));
    ipc.engineCliStatus().then((s) => setCliInstalled(s.installed)).catch(() => undefined);
  }, []);
  useEffect(() => refreshStatus(), [refreshStatus]);

  // The AI providers/models available here — the SAME ranked set Studio
  // supports (Local Runtime → In-DB AI → cloud). opencode drives whichever the
  // user picks; a cloud provider's models appear only once its key is set.
  const loadModels = useCallback(() => {
    return agent
      .models()
      .then(({ providers: ps, defaultModel }) => {
        setProviders(ps);
        setModel((cur) => {
          if (cur) return cur;
          if (defaultModel) {
            const [pid, ...rest] = defaultModel.split("/");
            return { providerID: pid, modelID: rest.join("/"), label: defaultModel };
          }
          const first = ps.find((p) => p.models.length > 0);
          return first ? { providerID: first.id, modelID: first.models[0].id, label: `${first.name} · ${first.models[0].name}` } : null;
        });
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => void loadModels(), [loadModels]);

  const saveKey = useCallback(
    async (providerId: string, key: string) => {
      await agent.setProviderKey(providerId, key);
      await loadModels();
    },
    [loadModels],
  );

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

  async function send(text: string, chips: ContextChip[], mode: ChatMode) {
    if (busy) return;
    const shown = text;
    const prompt = buildPrompt(mode === "ask" ? `Answer as a chat assistant without running tools.\n\n${text}` : text, chips);
    setMessages((m) => [...m, { role: "user", text: shown }]);
    setTools([]);
    setBusy(true);
    const fail = (msg: string) => {
      setMessages((m) => [...m, { role: "assistant", text: `⚠︎ ${msg}` }]);
      setBusy(false);
      refreshStatus();
    };
    try {
      let sid = sessionId;
      if (!sid) {
        const created = await agent.engine.createSession();
        if (!created?.id) return fail("The Exa engine isn't running yet. Install it and wait for the header to read “running”.");
        sid = created.id;
        setSessionId(sid);
      }
      const r = await agent.engine.prompt(sid, prompt, model ? { providerID: model.providerID, modelID: model.modelID } : undefined);
      if (!r?.ok) return fail("The engine could not run this turn — check that a model is selected and its provider is configured.");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Engine request failed.");
    }
  }

  async function stop() {
    if (sessionId) await agent.engine.abort(sessionId).catch(() => undefined);
    setBusy(false);
  }

  const iconBtn = "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground";

  // ── Install gate (not provisioned / binary absent) ──
  if (!status || (!status.provisioned && !installing) || (status.provisioned && !status.binaryPresent && !installing)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel px-8 text-center">
        <AgentMark className="h-11 w-11" />
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
        <AgentMark className="h-4 w-4" active={busy} />
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
        <span className={cn("flex items-center gap-1 font-mono text-[10.5px]", status.state === "running" ? "text-primary" : "text-muted-foreground")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", status.state === "running" ? "bg-primary" : "bg-muted-foreground/50")} />
          {status.state}
        </span>
        {onExpand ? (
          <button onClick={onExpand} title="Expand to full screen" className={iconBtn}>
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onCollapse ? (
          <button onClick={onCollapse} title="Dock to the side panel" className={iconBtn}>
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onClose ? (
          <button onClick={onClose} title="Hide Exa" className={iconBtn}>
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3 [scrollbar-width:thin]">
        {messages.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <AgentMark className="h-9 w-9" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">Ask Exa about your database</p>
              <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">
                Grounded in your live schema. Type <span className="font-mono text-primary">@</span> to attach a table,
                the current query, or your last results as context.
              </p>
            </div>
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
              {m.text}
            </div>
          ) : (
            <div key={i} className="max-w-[97%] rounded-lg bg-editor px-3 py-2">
              <ChatMarkdown text={m.text} onApplySql={onApplySql} />
            </div>
          ),
        )}
        {tools.map((t) => (
          <div key={t.callId} className="flex items-center gap-1.5 rounded-md border border-border bg-editor px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {t.ok === undefined ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wrench className={cn("h-3 w-3", t.ok ? "text-primary" : "text-destructive")} />}
            {t.name}
          </div>
        ))}
        {busy && tools.length === 0 && messages[messages.length - 1]?.role === "user" ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> thinking…
          </div>
        ) : null}
      </div>

      <ChatComposer
        providers={providers}
        model={model}
        onPickModel={setModel}
        onSaveKey={saveKey}
        getSnapshot={getSnapshot ?? (() => EMPTY_SNAPSHOT)}
        busy={busy}
        onSend={(text, chips, mode) => void send(text, chips, mode)}
        onStop={() => void stop()}
      />
    </div>
  );
}
