import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Terminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { agent, type AgentProviderInfo, type EngineSessionInfo, type EngineStatus } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
import { AgentMark } from "@/components/studio/AgentMark";
import { emptyCatalog } from "@/lib/sql-completion";
import { expandCommand, parseSlash, SLASH_COMMANDS, type LocalCommandId, type SlashCommand } from "./exa/commands";
import { buildPrompt, neutralizeSentinels, resolveContext, wrapMachineContext, type ContextChip, type ExaSnapshot } from "./exa/context";
import { ExaThread, type ChatMode, type SqlOps } from "./exa/ExaThread";
import { engineClientFor } from "./exa/engine-client";
import type { PickedModel } from "./exa/ExaModelSelector";

/**
 * Exa engine (v2, opencode) chat panel. Chat itself runs on the official
 * @assistant-ui/react-opencode runtime talking to the engine directly
 * (tauri-plugin-http fetch); this panel owns everything around it — install
 * gate, engine status, model/provider management via /v1/engine/*, sessions
 * sidebar data, modes/chips/slash commands, and the `@`-context composer.
 *
 * The engine binary is the opencode Marketplace component; this tag is the
 * baseline the Managed Components / Updates flow moves forward.
 */
const ENGINE_TAG = "v1.18.12-exa.5";

// The scope guardrail lives ENGINE-side now: the seeded "exa" agent
// (prompt + coding tools disabled) — see engine-service.ensureSeedConfig.

// Messages are ordered parts (text + tool calls inline) — see ExaThread.

const EMPTY_SNAPSHOT: ExaSnapshot = {
  schemas: [],
  catalog: emptyCatalog(),
  editorSql: "",
  lastResult: null,
  history: [],
};

/**
 * A crash inside the chat surface must degrade to an inline message — never
 * unmount the app (a thrown render = full black screen without a boundary).
 */
class ExaErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[exa] panel crashed", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-[13px] font-medium text-foreground">The Exa panel hit an error.</p>
          <p className="max-w-sm text-[11.5px] text-muted-foreground">{String(this.state.error.message ?? this.state.error).slice(0, 240)}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-1 rounded-md border border-border px-3 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Reload the panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  // The official opencode runtime (inside ExaThread) owns messages, busy
  // state, streaming and sessions. The panel keeps the surface state: the
  // engine client, the live session id (for /compact, /undo, persistence),
  // and everything around the composer.
  const [cliInstalled, setCliInstalled] = useState(false);
  const [cliBusy, setCliBusy] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<PickedModel | null>(null);
  // Model choice persists across surfaces and restarts.
  const pickModel = (m: PickedModel | null) => {
    setModel(m);
    try {
      if (m) localStorage.setItem("exa.model", JSON.stringify(m));
      else localStorage.removeItem("exa.model");
    } catch {
      /* private mode */
    }
  };
  // Composer state — the registry composer inside ExaThread reads/writes it
  // through the ExaComposerContext api object below.
  const [mode, setMode] = useState<ChatMode>("agent");
  // SQL operation grants (READ always on; C/U/D are explicit, persisted).
  const [sqlOps, setSqlOpsState] = useState<SqlOps>(() => {
    try {
      return { create: false, update: false, delete: false, ...JSON.parse(localStorage.getItem("exa.sqlOps") ?? "{}") } as SqlOps;
    } catch {
      return { create: false, update: false, delete: false };
    }
  });
  const setSqlOps = (ops: SqlOps) => {
    setSqlOpsState(ops);
    try {
      localStorage.setItem("exa.sqlOps", JSON.stringify(ops));
    } catch {
      /* private mode */
    }
  };
  const [chips, setChips] = useState<ContextChip[]>([]);
  // A picked slash command shown as a chip; the input text is its argument.
  const [pendingCommand, setPendingCommand] = useState<SlashCommand | null>(null);
  // /details — hide tool-execution chips in the thread.
  const [hideTools, setHideTools] = useState(false);
  // Persisted engine sessions (auto-titled) for the sidebar.
  const [sessions, setSessions] = useState<EngineSessionInfo[]>([]);
  // Archived = hidden locally (the engine has no archive concept).
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("exa.archivedSessions") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("exa.activeSession");
    } catch {
      return null;
    }
  });
  const onSessionChange = useCallback((id: string | undefined) => {
    setActiveSessionId(id ?? null);
    try {
      if (id) localStorage.setItem("exa.activeSession", id);
      else localStorage.removeItem("exa.activeSession");
    } catch {
      /* private mode */
    }
  }, []);
  // The SDK client for the runtime — built once the engine reports its port.
  const [engineClient, setEngineClient] = useState<Awaited<ReturnType<typeof engineClientFor>> | null>(null);
  // Guards loadModels against out-of-order responses (slow first load
  // overwriting a post-key-save refresh).
  const loadSeq = useRef(0);

  // The agent's ACTUAL internet capability (engine-enforced tool permission,
  // toggled in AI Settings). Woven into every message's directive so the
  // model never claims web access its tool list doesn't have.
  const [networkAllowed, setNetworkAllowed] = useState(false);
  const refreshStatus = useCallback(() => {
    agent.engine.status().then(setStatus).catch(() => setStatus(null));
    ipc.engineCliStatus().then((s) => setCliInstalled(s.installed)).catch(() => undefined);
    agent.engine.network().then((r) => setNetworkAllowed(r.allowed)).catch(() => undefined);
  }, []);
  useEffect(() => refreshStatus(), [refreshStatus]);

  // The AI providers/models available here — the SAME ranked set Studio
  // supports (Local Runtime → In-DB AI → cloud). opencode drives whichever the
  // user picks; a cloud provider's models appear only once its key is set.
  const loadModels = useCallback(() => {
    const seq = ++loadSeq.current;
    return agent
      .models()
      .then(async ({ providers: ps, defaultModel }) => {
        // Merge in the ENGINE's own provider catalog (GET /config/providers):
        // anything opencode has configured that Studio's ranked list doesn't
        // already cover appears as an extra, already-configured section.
        try {
          const eng = await agent.engine.providers();
          for (const ep of eng.providers) {
            if (ep.models.length === 0) continue;
            const models = ep.models.map((m) => ({ id: m.id, name: m.name, context: m.context, variants: m.variants }));
            const idx = ps.findIndex((p) => p.id === ep.id);
            if (idx === -1) {
              ps = [...ps, { id: ep.id, name: ep.name, kind: "cloud", configured: true, models }];
            } else if (ps[idx].kind === "cloud") {
              // The ENGINE is authoritative for cloud providers: an OAuth or
              // key connect lives in the engine, so a provider Studio's own
              // list still thinks is unconfigured must flip to connected here
              // (this is what unlocks OpenAI/Copilot models after sign-in).
              ps = ps.map((p, i) => (i === idx ? { ...p, configured: true, models } : p));
            }
          }
        } catch {
          /* engine absent/stopped — Studio's own list is enough */
        }
        if (seq !== loadSeq.current) return; // a newer refresh already applied
        setProviders(ps);
        setModel((cur) => {
          if (cur) return cur;
          // A previously picked model (either surface) wins over the default.
          try {
            const saved = localStorage.getItem("exa.model");
            if (saved) return JSON.parse(saved) as PickedModel;
          } catch {
            /* fall through to defaults */
          }
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
      // The ENGINE's auth store is the source of truth (opencode drives the
      // provider); the sidecar copy keeps Studio's own surfaces coherent for
      // the providers it knows — its failure must not block the engine save.
      await agent.engine.setAuth(providerId, key).catch(() => undefined);
      await agent.setProviderKey(providerId, key).catch(() => undefined);
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

  // The exa terminal command ships with the app: (re)write the PATH shim
  // once per run when the engine is usable — the shim embeds an absolute
  // binary path, so it must refresh after app/engine updates or it keeps
  // launching the old binary. Idempotent plain file write.
  const shimWrittenRef = useRef(false);
  useEffect(() => {
    if (!status?.provisioned || !status.binaryPresent || shimWrittenRef.current || cliBusy) return;
    shimWrittenRef.current = true;
    void installCli().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.provisioned, status?.binaryPresent]);

  // Build the runtime's SDK client whenever the engine reports a port —
  // engineClientFor caches per port, so a restart on the SAME port is a no-op
  // while a port change (supervisor fallback) swaps in a fresh client.
  useEffect(() => {
    if (!status?.provisioned || !status.binaryPresent) return;
    if (status.port) {
      void engineClientFor(status.port).then(setEngineClient).catch(() => undefined);
      return;
    }
    if (engineClient) return; // engine restarting — keep the old client until a new port appears
    // Not running yet — poke it awake (any sidecar call starts it lazily), then re-check.
    void agent.engine.sessions().catch(() => undefined);
    const t = window.setTimeout(refreshStatus, 900);
    return () => window.clearTimeout(t);
  }, [status, engineClient, refreshStatus]);

  async function install() {
    setInstalling(true);
    try {
      await ipc.engineInstall(ENGINE_TAG);
      refreshStatus();
    } finally {
      setInstalling(false);
    }
  }

  // Modes — all of them ride the seeded "exa" agent (guardrail prompt, coding
  // tools denied engine-side; the runtime pins defaultAgent). The per-message
  // directives below are what differentiate Chat/Plan/Agent behavior.
  const MODE_DIRECTIVE: Record<ChatMode, string> = {
    chat: "Answer as a chat assistant. Do not run tools.",
    plan: "Only inspect (SELECT queries, schema reads). Never modify data or schema. Propose a plan and the exact SQL for the user to approve.",
    agent: "",
  };

  /** Refresh the sidebar's session list (titles are engine-generated). */
  const loadSessions = useCallback(() => {
    agent.engine
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!status?.provisioned || !status.binaryPresent) return;
    loadSessions();
    // Engine-generated titles land shortly after each turn — refresh gently.
    const t = window.setInterval(loadSessions, 20_000);
    return () => window.clearInterval(t);
  }, [status?.provisioned, status?.binaryPresent, loadSessions]);

  /** Permanently delete a session engine-side. */
  async function deleteSession(id: string) {
    await agent.engine.deleteSession(id).catch(() => undefined);
    setSessions((ss) => ss.filter((s) => s.id !== id));
    if (activeSessionId === id) newChat();
  }

  /** Rename a session engine-side (overrides the auto-generated title). */
  async function renameSession(id: string, title: string) {
    const t = title.trim();
    if (!t) return;
    await agent.engine.renameSession(id, t).catch(() => undefined);
    setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, title: t } : s)));
  }

  /** Archive = hide locally (persisted); the engine keeps the session. */
  function archiveSession(id: string) {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("exa.archivedSessions", JSON.stringify([...next]));
      } catch {
        /* private mode — archive lasts for this run only */
      }
      return next;
    });
    if (activeSessionId === id) newChat();
  }

  /** /new, /clear, the sidebar button: the runtime switches to a new thread. */
  function newChat() {
    setChips([]);
    setPendingCommand(null);
    window.dispatchEvent(new CustomEvent("exa:new-thread"));
  }

  /** Transient notices (help text, command results) via Studio's notifier. */
  function notice(title: string, body?: string) {
    window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind: "info", title, body: body ?? "" } }));
  }

  /** /compact: engine-side summarization to reclaim the session's context. */
  async function compactChat() {
    if (!activeSessionId) return;
    const r = await agent.engine.compact(activeSessionId).catch(() => ({ ok: false }));
    notice(r.ok ? "Session compacted" : "Compaction failed", r.ok ? "Older turns were summarized to free context." : "Is the engine running?");
    loadSessions();
  }

  /** /undo and /redo — the engine reverts/restores the last message. */
  async function undoRedo(kind: "undo" | "redo") {
    if (!activeSessionId) return;
    const r = await (kind === "undo" ? agent.engine.undo(activeSessionId) : agent.engine.redo(activeSessionId)).catch(() => ({ ok: false }));
    if (!r.ok) notice(kind === "undo" ? "Undo isn't available here" : "Redo isn't available here");
  }

  /** Local slash commands (also reachable from the header/sidebar). */
  function runLocal(id: LocalCommandId) {
    if (id === "clear" || id === "new") newChat();
    else if (id === "compact" || id === "summarize") void compactChat();
    else if (id === "export" || id === "share") window.dispatchEvent(new CustomEvent("exa:share"));
    else if (id === "connect" || id === "models") window.dispatchEvent(new CustomEvent("exa:open-providers"));
    else if (id === "mcp") window.dispatchEvent(new CustomEvent("exa:open-mcp"));
    else if (id === "sessions" || id === "resume") window.dispatchEvent(new CustomEvent("exa:open-sessions"));
    else if (id === "details") setHideTools((h) => !h);
    else if (id === "undo" || id === "redo") void undoRedo(id);
    else if (id === "help")
      notice(
        "Exa commands",
        SLASH_COMMANDS.map((c) => `/${c.title}${c.hint ? ` <${c.hint}>` : ""} — ${c.description}`).join("\n") +
          "\nType @ to attach database context (query, results, tables, schema).",
      );
  }

  /**
   * The composer's send pipeline (invoked from ExaSendButton and the
   * suggestion chips): slash-command expansion with auto-attached context,
   * manual @-chips, mode directives and quotes — returning the final engine
   * text, or null when the input was a local command handled here.
   */
  function expandForSend(text: string, quote?: string): string | null {
    const slash = pendingCommand ? { command: pendingCommand, arg: text.trim() } : parseSlash(text);
    if (slash?.command.kind === "local") {
      setPendingCommand(null);
      runLocal(slash.command.id as LocalCommandId);
      return null;
    }
    // A user typing the literal sentinel tags must not break the stripping.
    let engine = neutralizeSentinels(text);
    let allChips = chips; // manual @-context chips from the composer
    if (slash) {
      const snap = (getSnapshot ?? (() => EMPTY_SNAPSHOT))();
      const e = expandCommand(slash.command.id, slash.arg, snap);
      engine = e.text;
      const auto = e.providerIds.map((id) => resolveContext(id, null, snap)).filter((c): c is ContextChip => c !== null);
      allChips = [...chips, ...auto.filter((a) => !chips.some((c) => c.id === a.id))];
    }
    const granted = ["READ", sqlOps.create && "CREATE (CREATE/INSERT/IMPORT)", sqlOps.update && "UPDATE (UPDATE/MERGE/ALTER)", sqlOps.delete && "DELETE (DELETE/TRUNCATE/DROP)"]
      .filter(Boolean)
      .join(", ");
    const opsDirective = `Allowed SQL operation classes: ${granted}. If a task needs a class that is not allowed, refuse that statement and tell the user to grant it via the shield control next to the mode switcher.`;
    const netDirective = networkAllowed
      ? ""
      : "You are SANDBOXED with no internet access: the webfetch/websearch tools are denied engine-side and absent from your tool list. Never claim you can browse, search the web, or fetch URLs; if asked, say internet access is off and can be enabled in AI Settings under Guardrails.";
    const directive = [MODE_DIRECTIVE[mode], opsDirective, netDirective].filter(Boolean).join(" ");
    // Machine additions (directives + chip context) ride inside the sentinel
    // block so the UI renders only what the user actually typed — see
    // stripMachineContext in the user-message renderer.
    const chipContext = allChips.length ? buildPrompt("", allChips).trimEnd() : "";
    const machine = wrapMachineContext([directive, chipContext].filter(Boolean).join("\n\n"));
    let out = machine ? `${machine}\n\n${engine}` : engine;
    if (quote) out = `${machine ? machine + "\n\n" : ""}Regarding this excerpt from your earlier reply:\n> ${quote.replace(/\n/g, "\n> ")}\n\n${engine}`;
    setChips([]);
    setPendingCommand(null);
    return out;
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

  // Surface controls live in the thread header (right of the share button).
  const headerActions = (
    <>
      <span
        title={`Engine ${status.state}`}
        className={cn("mx-1 h-1.5 w-1.5 rounded-full", status.state === "running" ? "bg-foreground/70" : "bg-muted-foreground/40")}
      />
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
    </>
  );

  const sidebarFooter = (
    <button
      onClick={() => void installCli()}
      disabled={cliBusy}
      title={cliInstalled ? "exa CLI is on your PATH — click to refresh" : "Install the exa terminal command to your PATH"}
      className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Terminal className="h-3.5 w-3.5" /> {cliBusy ? "…" : cliInstalled ? "exa CLI installed" : "Install exa CLI"}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {engineClient ? (
      <ExaErrorBoundary>
      <ExaThread
        client={engineClient}
        initialSessionId={activeSessionId ?? undefined}
        onSessionChange={onSessionChange}
        hideTools={hideTools}
        onApplySql={onApplySql}
        sessions={sessions.filter(
          // Hide archived ones, and blank eagerly-created sessions (engine
          // default title) that never got a first message — except the active
          // one, so the current chat always has its sidebar row.
          (s) => !archivedIds.has(s.id) && (s.id === activeSessionId || !(s.title ?? "").startsWith("New session")),
        )}
        activeSessionId={activeSessionId}
        onNewThread={newChat}
        onSelectSession={(id) => onSessionChange(id)}
        onRenameSession={(id, title) => void renameSession(id, title)}
        onDeleteSession={(id) => void deleteSession(id)}
        onArchiveSession={archiveSession}
        headerActions={headerActions}
        sidebarFooter={sidebarFooter}
        defaultSidebarOpen={Boolean(onCollapse)}
        composerApi={{
          providers,
          model,
          onPickModel: pickModel,
          onSaveKey: saveKey,
          getSnapshot: getSnapshot ?? (() => EMPTY_SNAPSHOT),
          mode,
          setMode,
          chips,
          addChip: (c) => {
            if (c) setChips((cs) => (cs.some((x) => x.id === c.id) ? cs : [...cs, c]));
          },
          removeChip: (id) => setChips((cs) => cs.filter((x) => x.id !== id)),
          pendingCommand,
          setPendingCommand,
          runLocal,
          loadCatalog: () => agent.engine.catalog().then((r) => r.providers),
          onConnected: () => {
            refreshStatus();
            return loadModels();
          },
          expandForSend,
          sqlOps,
          setSqlOps,
        }}
      />
      </ExaErrorBoundary>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting the Exa engine…
        </div>
      )}
    </div>
  );
}
