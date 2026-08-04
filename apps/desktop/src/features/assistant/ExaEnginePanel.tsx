import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Square, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { agent, type EngineEvent, type EngineStatus } from "@/lib/agent-client";
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
  const disposer = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(() => {
    agent.engine.status().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => refreshStatus(), [refreshStatus]);

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
      await agent.engine.prompt(sid, text);
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
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
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
