import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Terminal, X } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { agent, type AgentProviderInfo, type EngineEvent, type EngineSessionInfo, type EngineStatus } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
import { AgentMark } from "@/components/studio/AgentMark";
import { emptyCatalog } from "@/lib/sql-completion";
import { expandCommand, parseSlash, transcriptMarkdown, SLASH_COMMANDS, type LocalCommandId, type SlashCommand } from "./exa/commands";
import { buildPrompt, resolveContext, type ContextChip, type ExaSnapshot } from "./exa/context";
import { ExaThread, messageText, type ChatMode, type ExaMessage } from "./exa/ExaThread";
import type { PickedModel } from "./exa/ExaModelSelector";

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

// Messages are ordered parts (text + tool calls inline) — see ExaThread.

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
  const [messages, setMessages] = useState<ExaMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(false);
  const [cliBusy, setCliBusy] = useState(false);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [model, setModel] = useState<PickedModel | null>(null);
  // Composer state now lives here — the registry composer inside ExaThread
  // reads/writes it through the ExaComposerContext api object below.
  const [mode, setMode] = useState<ChatMode>("agent");
  const [chips, setChips] = useState<ContextChip[]>([]);
  // A picked slash command shown as a chip; the input text is its argument.
  const [pendingCommand, setPendingCommand] = useState<SlashCommand | null>(null);
  // /details — hide tool-execution chips in the thread.
  const [hideTools, setHideTools] = useState(false);
  // Persisted engine sessions (auto-titled) for the sidebar.
  const [sessions, setSessions] = useState<EngineSessionInfo[]>([]);
  // Archived = hidden locally (the engine has no archive concept); persisted
  // per machine so archived chats stay out of the sidebar across restarts.
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("exa.archivedSessions") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const disposer = useRef<(() => void) | null>(null);
  // The live session id, readable from the long-lived stream callback (state
  // there would be a stale closure). Kept in sync with setSessionId below.
  const sessionRef = useRef<string | null>(null);
  // The side dock and the full tab are separate instances of this panel; they
  // converge on ONE session: a change here is persisted + broadcast, and the
  // other instance adopts it (hydrating from the engine's stored history).
  const instanceId = useRef(`exa-${Math.random().toString(36).slice(2)}`);
  const setSession = (id: string | null) => {
    if (sessionRef.current === id) return;
    sessionRef.current = id;
    setSessionId(id);
    try {
      if (id) localStorage.setItem("exa.activeSession", id);
      else localStorage.removeItem("exa.activeSession");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent("exa:session", { detail: { id, src: instanceId.current } }));
  };
  /** Follow a session another surface switched to (or a restart restored). */
  const adoptSession = useCallback(async (id: string | null) => {
    sessionRef.current = id;
    setSessionId(id);
    setBusy(false);
    if (!id) {
      setMessages([]);
      return;
    }
    try {
      const r = await agent.engine.messages(id);
      if (sessionRef.current === id) setMessages(r.messages);
    } catch {
      /* engine offline — the next live event will still land (same id) */
    }
  }, []);
  useEffect(() => {
    const onSession = (e: Event) => {
      const d = (e as CustomEvent<{ id: string | null; src: string }>).detail;
      if (d.src === instanceId.current || d.id === sessionRef.current) return;
      void adoptSession(d.id);
    };
    window.addEventListener("exa:session", onSession);
    return () => window.removeEventListener("exa:session", onSession);
  }, [adoptSession]);
  // Bumped by newChat(); a send() whose token is stale abandons its turn.
  const turnGen = useRef(0);
  // Guards loadModels against out-of-order responses (slow first load
  // overwriting a post-key-save refresh).
  const loadSeq = useRef(0);
  // The session-list refresher, reachable from the long-lived stream callback.
  const loadSessionsRef = useRef<() => void>(() => {});

  const refreshStatus = useCallback(() => {
    agent.engine.status().then(setStatus).catch(() => setStatus(null));
    ipc.engineCliStatus().then((s) => setCliInstalled(s.installed)).catch(() => undefined);
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
          const known = new Set(ps.map((p) => p.id));
          for (const ep of eng.providers) {
            if (known.has(ep.id) || ep.models.length === 0) continue;
            ps = [...ps, {
              id: ep.id,
              name: `${ep.name} (engine)`,
              kind: "cloud",
              configured: true,
              models: ep.models.map((m) => ({ id: m.id, name: m.name, context: m.context })),
            }];
          }
        } catch {
          /* engine absent/stopped — Studio's own list is enough */
        }
        if (seq !== loadSeq.current) return; // a newer refresh already applied
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

  // Live event stream → messages + tool cards.
  useEffect(() => {
    let alive = true;
    agent.engine
      .stream((e: EngineEvent) => {
        if (!alive) return;
        // Drop events from a session that is no longer ours (after /clear or a
        // session switch, a discarded turn can still emit). Events without a
        // session id can't be attributed, so they pass through.
        if (e.sessionId && e.sessionId !== sessionRef.current) return;
        if (e.type === "message.delta") {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role === "assistant") {
              const parts = [...last.parts];
              const tail = parts[parts.length - 1];
              if (tail?.type === "text") parts[parts.length - 1] = { ...tail, text: tail.text + e.text };
              else parts.push({ type: "text", text: e.text });
              return [...m.slice(0, -1), { ...last, parts }];
            }
            return [...m, { role: "assistant", parts: [{ type: "text", text: e.text }] }];
          });
        } else if (e.type === "tool.start") {
          setMessages((m) => {
            const last = m[m.length - 1];
            const part = { type: "tool" as const, callId: e.callId, name: e.name };
            if (last?.role === "assistant") return [...m.slice(0, -1), { ...last, parts: [...last.parts, part] }];
            return [...m, { role: "assistant", parts: [part] }];
          });
        } else if (e.type === "tool.result") {
          // Touch ONLY the message holding this call — untouched references
          // keep assistant-ui's converted-message cache warm.
          setMessages((m) => {
            const mi = m.findIndex((msg) => msg.parts.some((p) => p.type === "tool" && p.callId === e.callId));
            if (mi === -1) return m;
            const next = [...m];
            next[mi] = {
              ...next[mi],
              parts: next[mi].parts.map((p) => (p.type === "tool" && p.callId === e.callId ? { ...p, ok: e.ok } : p)),
            };
            return next;
          });
        } else if (e.type === "session.idle" || e.type === "message.done") {
          setBusy(false);
          // Titles are generated engine-side after the turn — give it a beat.
          window.setTimeout(loadSessionsRef.current, 1500);
        } else if (e.type === "error") {
          setMessages((m) => [...m, { role: "assistant", parts: [{ type: "text", text: `⚠︎ ${e.message}` }] }]);
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

  async function install() {
    setInstalling(true);
    try {
      await ipc.engineInstall(ENGINE_TAG);
      refreshStatus();
    } finally {
      setInstalling(false);
    }
  }

  // Modes — continue.dev's Chat/Plan/Agent mapped to the engine's NATIVE
  // agents: Agent → opencode "build" (all tools), Plan → opencode "plan"
  // (mutations gated behind ask). Chat has no tool-less built-in agent, so it
  // rides "plan" plus a no-tools directive — worst case a tool call still
  // needs explicit approval.
  const MODE_TO_AGENT: Record<ChatMode, string> = { agent: "build", plan: "plan", chat: "plan" };
  const MODE_DIRECTIVE: Record<ChatMode, string> = {
    chat: "Answer as a chat assistant. Do not run tools.",
    plan: "Only inspect (SELECT queries, schema reads). Never modify data or schema. Propose a plan and the exact SQL for the user to approve.",
    agent: "",
  };

  async function send({ shown, engine, chips, mode, quote }: { shown: string; engine: string; chips: ContextChip[]; mode: ChatMode; quote?: string }) {
    if (busy) return;
    const directive = MODE_DIRECTIVE[mode];
    const prompt = buildPrompt(directive ? `${directive}\n\n${engine}` : engine, chips);
    setMessages((m) => [...m, { role: "user", parts: [{ type: "text", text: shown }], ...(quote ? { quote } : {}) }]);
    setBusy(true);
    const fail = (msg: string) => {
      setMessages((m) => [...m, { role: "assistant", parts: [{ type: "text", text: `⚠︎ ${msg}` }] }]);
      setBusy(false);
      refreshStatus();
    };
    const gen = turnGen.current;
    try {
      let sid = sessionId;
      if (!sid) {
        const created = await agent.engine.createSession();
        if (gen !== turnGen.current) {
          // The user hit /clear while the session was being created — abandon
          // this turn and don't resurrect the discarded session.
          if (created?.id) agent.engine.abort(created.id).catch(() => undefined);
          return;
        }
        if (!created?.id) return fail("The Exa engine isn't running yet. Install it and wait for the header to read “running”.");
        sid = created.id;
        setSession(sid);
      }
      const r = await agent.engine.prompt(sid, prompt, model ? { providerID: model.providerID, modelID: model.modelID } : undefined, MODE_TO_AGENT[mode]);
      if (gen !== turnGen.current) return; // cleared mid-turn — UI already reset
      if (!r?.ok) return fail("The engine could not run this turn — check that a model is selected and its provider is configured.");
    } catch (e) {
      if (gen === turnGen.current) fail(e instanceof Error ? e.message : "Engine request failed.");
    }
  }

  async function stop() {
    if (sessionId) await agent.engine.abort(sessionId).catch(() => undefined);
    setBusy(false);
  }

  /** Refresh the sidebar's session list (titles are engine-generated). */
  const loadSessions = useCallback(() => {
    agent.engine
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => undefined);
  }, []);
  loadSessionsRef.current = loadSessions;
  useEffect(() => {
    if (!status?.provisioned || !status.binaryPresent) return;
    loadSessions();
    // Restore the last active session (both surfaces converge on it).
    if (!sessionRef.current) {
      try {
        const saved = localStorage.getItem("exa.activeSession");
        if (saved) void adoptSession(saved);
      } catch {
        /* private mode */
      }
    }
  }, [status?.provisioned, status?.binaryPresent, loadSessions, adoptSession]);

  /** Permanently delete a session engine-side. */
  async function deleteSession(id: string) {
    await agent.engine.deleteSession(id).catch(() => undefined);
    setSessions((ss) => ss.filter((s) => s.id !== id));
    if (sessionRef.current === id) newChat();
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
    if (sessionRef.current === id) newChat();
  }

  /** Open a past session: load its stored messages and make it live. */
  async function selectSession(id: string) {
    if (id === sessionId) return;
    turnGen.current += 1; // abandon any in-flight turn
    if (busy) void stop();
    setSession(id);
    setChips([]);
    try {
      const r = await agent.engine.messages(id);
      // Only apply if the user hasn't switched again meanwhile.
      if (sessionRef.current === id) setMessages(r.messages);
    } catch {
      if (sessionRef.current === id) setMessages([]);
    }
  }

  /** /clear and the header + button: drop the session, start fresh. */
  function newChat() {
    turnGen.current += 1; // any in-flight send() abandons itself
    if (busy) void stop();
    setSession(null);
    setMessages([]);
  }

  /** /share: export the conversation as a Markdown file. */
  async function shareChat() {
    if (messages.length === 0) return;
    try {
      const path = await saveDialog({ defaultPath: "exa-conversation.md", filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (path) await ipc.writeTextFile(path, transcriptMarkdown(messages.map((m) => ({ role: m.role, text: messageText(m) }))));
    } catch {
      /* user cancelled */
    }
  }

  /** /compact: engine-side summarization to reclaim the session's context. */
  async function compactChat() {
    if (!sessionId) return;
    const r = await agent.engine.compact(sessionId).catch(() => ({ ok: false }));
    setMessages((m) => [
      ...m,
      { role: "assistant", parts: [{ type: "text", text: r.ok ? "_Session compacted — older turns were summarized to free context._" : "⚠︎ Compaction failed — is the engine running?" }] },
    ]);
    window.setTimeout(loadSessionsRef.current, 1500);
  }

  /** Append a local notice into the thread (help text, undo/redo results). */
  function notice(text: string) {
    setMessages((m) => [...m, { role: "assistant", parts: [{ type: "text", text }] }]);
  }

  /** /undo and /redo — the engine reverts/restores the last message. */
  async function undoRedo(kind: "undo" | "redo") {
    if (!sessionId) return;
    const r = await (kind === "undo" ? agent.engine.undo(sessionId) : agent.engine.redo(sessionId)).catch(() => ({ ok: false }));
    if (r.ok) await adoptSession(sessionId); // re-sync from the engine's store
    else notice(`⚠︎ ${kind === "undo" ? "Undo" : "Redo"} isn't available here.`);
  }

  /** Local slash commands (also reachable from the header/sidebar). */
  function runLocal(id: LocalCommandId) {
    if (id === "clear" || id === "new") newChat();
    else if (id === "compact" || id === "summarize") void compactChat();
    else if (id === "export" || id === "share") void shareChat();
    else if (id === "connect" || id === "models") window.dispatchEvent(new CustomEvent("exa:open-providers"));
    else if (id === "sessions" || id === "resume") window.dispatchEvent(new CustomEvent("exa:open-sessions"));
    else if (id === "details") setHideTools((h) => !h);
    else if (id === "undo" || id === "redo") void undoRedo(id);
    else if (id === "help")
      notice(
        "**Commands**\n\n" +
          SLASH_COMMANDS.map((c) => `- \`/${c.title}\`${c.hint ? ` _${c.hint}_` : ""} — ${c.description}`).join("\n") +
          "\n\nType `@` to attach database context (query, results, tables, schema).",
      );
  }

  /** Every submit path (registry composer, suggestions, edits) lands here. */
  function sendText(text: string, quote?: string) {
    // A command chip takes the typed text as its argument; typed "/cmd arg"
    // still works too (suggestion pills, muscle memory).
    const slash = pendingCommand
      ? { command: pendingCommand, arg: text.trim() }
      : parseSlash(text);
    if (slash?.command.kind === "local") {
      setPendingCommand(null);
      runLocal(slash.command.id as LocalCommandId);
      return;
    }
    let shown = text;
    let engine = text;
    let allChips = chips; // manual @-context chips from the composer
    if (slash) {
      const snap = (getSnapshot ?? (() => EMPTY_SNAPSHOT))();
      const e = expandCommand(slash.command.id, slash.arg, snap);
      engine = e.text;
      shown = pendingCommand ? `/${slash.command.title}${slash.arg ? ` ${slash.arg}` : ""}` : text;
      const auto = e.providerIds.map((id) => resolveContext(id, null, snap)).filter((c): c is ContextChip => c !== null);
      allChips = [...chips, ...auto.filter((a) => !chips.some((c) => c.id === a.id))];
    }
    // A quoted excerpt travels with the prompt so the model knows the referent.
    if (quote) engine = `Regarding this excerpt from your earlier reply:\n> ${quote.replace(/\n/g, "\n> ")}\n\n${engine}`;
    setChips([]);
    setPendingCommand(null);
    void send({ shown, engine, chips: allChips, mode, quote });
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
      <ExaThread
        messages={messages}
        busy={busy}
        hideTools={hideTools}
        onSendText={sendText}
        onCancel={() => void stop()}
        onApplySql={onApplySql}
        sessions={sessions.filter((s) => !archivedIds.has(s.id))}
        activeSessionId={sessionId}
        onNewThread={newChat}
        onSelectSession={(id) => void selectSession(id)}
        onRenameSession={(id, title) => void renameSession(id, title)}
        onDeleteSession={(id) => void deleteSession(id)}
        onArchiveSession={archiveSession}
        onShare={() => void shareChat()}
        headerActions={headerActions}
        sidebarFooter={sidebarFooter}
        defaultSidebarOpen={Boolean(onCollapse)}
        composerApi={{
          providers,
          model,
          onPickModel: setModel,
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
        }}
      />
    </div>
  );
}
