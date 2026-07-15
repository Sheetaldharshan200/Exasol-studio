import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, useMotionValue, useSpring } from "motion/react";
import { Plus, Send, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AgentMark } from "@/components/studio/AgentMark";
import { PetAvatar, type PetAvatarId, type PetExpression } from "@/components/studio/PetAvatar";
import { agent, type AgentEvent } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED } from "@/lib/ai-window";
import { petBus } from "@/lib/pet-bus";
import { sessionBus } from "@/lib/session-bus";
import { cn } from "@/lib/utils";

// THE pet — exactly one on screen. It idles where you dock it (drag to move,
// grab the corner to resize), travels when the agent acts in the UI, and
// answers quick questions in its own bubble without opening the side panel.

const DOCK_KEY = "exasol-pet-dock";
const SIZE_KEY = "exasol-pet-size";

type PetChat = {
  status: "idle" | "thinking" | "tool" | "streaming";
  toolLabel?: string;
  answer: string;
  error?: string;
};

const TOOL_LABELS: Record<string, string> = {
  kb_search: "checking the knowledge graph",
  list_schemas: "listing schemas",
  list_tables: "listing tables",
  describe_table: "reading table structure",
  run_sql: "running SQL",
  profile_query: "profiling",
  spawn_researcher: "sending researchers",
  ui_connect: "connecting",
  ui_open: "opening",
  ui_editor_insert: "writing SQL",
  dashboard_save: "building the dashboard",
  list_connections: "checking connections",
  app_ui_locate: "finding my way",
};

export function FloatingPet({
  connectionId,
  onUiAction,
  standalone = false,
  offset = 0,
  onSpawn,
  onClose,
}: {
  connectionId?: string | null;
  onUiAction?: (action: string, params: Record<string, unknown>) => Promise<{ ok: boolean; detail?: string }>;
  /** Standalone pets own a private session (task runners); the primary pet mirrors the AI panel's session. */
  standalone?: boolean;
  /** Dock offset so multiple pets don't stack. */
  offset?: number;
  onSpawn?: () => void;
  onClose?: () => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [avatar, setAvatar] = useState<PetAvatarId>("exa");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [scale, setScale] = useState(() => Number(localStorage.getItem(SIZE_KEY)) || 1);
  const [expression, setExpression] = useState<PetExpression>("idle");
  const [traveling, setTraveling] = useState(false);
  const [chat, setChat] = useState<PetChat | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const modelRef = useRef<string | null>(null);
  const dragging = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const resizing = useRef<{ startY: number; startScale: number } | null>(null);

  // Dock position (persisted); springs drive both docking and travel.
  const dock = useRef<{ x: number; y: number }>(
    (() => {
      try {
        const saved = standalone ? null : JSON.parse(localStorage.getItem(DOCK_KEY) ?? "");
        if (typeof saved?.x === "number" && typeof saved?.y === "number") return saved;
      } catch {
        // default below
      }
      return { x: window.innerWidth - 76 - offset * 64, y: window.innerHeight - 128 };
    })(),
  );
  const x = useMotionValue(dock.current.x);
  const y = useMotionValue(dock.current.y);
  const sx = useSpring(x, { stiffness: 70, damping: 15, mass: 1 });
  const sy = useSpring(y, { stiffness: 70, damping: 15, mass: 1 });

  // Settings (mode + avatar) — live via the providers-changed event.
  useEffect(() => {
    const check = () =>
      agent
        .getSettings()
        .then(({ settings }) => {
          setEnabled(settings.petMode === "pet");
          setAvatar(settings.petAvatar ?? "exa");
        })
        .catch(() => undefined);
    void check();
    const un = listen(EV_AI_PROVIDERS_CHANGED, () => void check());
    return () => {
      void un.then((f) => f());
      disposeRef.current?.();
    };
  }, []);

  // Travel commands from the agent's UI actions.
  useEffect(
    () =>
      petBus.on((cmd) => {
        if (standalone) return;
        if (cmd.type === "travel") {
          setTraveling(true);
          setOpen(false);
          setExpression("walk");
          x.set(Math.min(Math.max(cmd.x, 8), window.innerWidth - 40));
          y.set(Math.min(Math.max(cmd.y, 8), window.innerHeight - 48));
        } else if (cmd.type === "work") {
          setExpression("work");
        } else if (cmd.type === "celebrate") {
          setExpression(cmd.ok ? "happy" : "idle");
        } else if (cmd.type === "home") {
          setExpression("walk");
          x.set(dock.current.x);
          y.set(dock.current.y);
          window.setTimeout(() => {
            setExpression("idle");
            setTraveling(false);
          }, 700);
        }
      }),
    [x, y],
  );

  // Bubble dismissal.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const attach = useCallback(
    async (sid: string) => {
      if (sessionRef.current === sid) return;
      disposeRef.current?.();
      sessionRef.current = sid;
      setChat({ status: "idle", answer: "" });
      disposeRef.current = await agent.stream(sid, (e) => handleEventRef.current(e));
    },
    [],
  );
  const handleEventRef = useRef<(e: AgentEvent) => void>(() => undefined);

  // The primary pet mirrors whatever session the AI panel is on.
  useEffect(() => {
    if (standalone) return;
    const cur = sessionBus.get();
    if (cur) void attach(cur);
    return sessionBus.on((sid) => {
      if (sid) void attach(sid);
    });
  }, [standalone, attach]);

  const handleEvent = useCallback(
    (e: AgentEvent) => {
      if (e.type === "status" && e.state === "thinking") {
        setChat((c) => (c ? { ...c, status: "thinking" } : c));
        setExpression("work");
      } else if (e.type === "tool-start") {
        setChat((c) => (c ? { ...c, status: "tool", toolLabel: TOOL_LABELS[e.name] ?? e.name } : c));
      } else if (e.type === "text-delta") {
        setChat((c) => (c ? { ...c, status: "streaming", answer: c.answer + e.delta } : c));
      } else if (e.type === "message-done") {
        setChat((c) => (c ? { ...c, status: "idle" } : c));
        setExpression("happy");
        window.setTimeout(() => setExpression("idle"), 1200);
      } else if (e.type === "error") {
        setChat((c) => (c ? { ...c, status: "idle", error: e.message } : c));
        setExpression("idle");
      } else if (e.type === "ui-request") {
        void (async () => {
          const sid = sessionRef.current;
          if (!sid) return;
          const r = (await onUiAction?.(e.action, e.params).catch((err) => ({
            ok: false as const,
            detail: String(err),
          }))) ?? { ok: false as const, detail: "UI control unavailable" };
          await agent.answerUi(sid, e.id, r.ok, r.detail).catch(() => undefined);
        })();
      }
    },
    [onUiAction],
  );
  handleEventRef.current = handleEvent;

  async function ask() {
    const q = text.trim();
    if (!q) return;
    setText("");
    setChat({ status: "thinking", answer: "" });
    setExpression("work");
    try {
      if (!modelRef.current) {
        const { providers, defaultModel } = await agent.models();
        modelRef.current =
          defaultModel ??
          (() => {
            const local = providers.find((p) => p.kind === "local" && p.running && p.models.length);
            if (local) return `${local.id}/${local.models[0].id}`;
            const cloud = providers.find((p) => p.kind === "cloud" && p.configured && p.models.length);
            return cloud ? `${cloud.id}/${cloud.models[0].id}` : null;
          })();
      }
      if (!modelRef.current) {
        setChat({ status: "idle", answer: "", error: "No AI model available yet — set one up in AI Settings." });
        return;
      }
      if (!sessionRef.current) {
        const shared = !standalone ? sessionBus.get() : null;
        const sid = shared ?? (await agent.createSession());
        await attach(sid);
        if (!standalone) sessionBus.set(sid);
      }
      if (!sessionRef.current) throw new Error("no session");
      await agent.send(sessionRef.current, q, modelRef.current, undefined, connectionId);
    } catch (e) {
      setChat({ status: "idle", answer: "", error: String(e) });
    }
  }

  async function stop() {
    if (sessionRef.current) await agent.abort(sessionRef.current).catch(() => undefined);
  }

  // Drag to move (click still opens); corner handle resizes.
  function onPetPointerDown(e: React.PointerEvent) {
    e.preventDefault(); // no text selection while dragging
    document.body.classList.add("select-none");
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = { dx: e.clientX - x.get(), dy: e.clientY - y.get(), moved: false };
  }
  function onPetPointerMove(e: React.PointerEvent) {
    if (resizing.current) {
      const next = Math.min(1.8, Math.max(0.7, resizing.current.startScale + (e.clientY - resizing.current.startY) / 140));
      setScale(next);
      return;
    }
    if (!dragging.current) return;
    const nx = e.clientX - dragging.current.dx;
    const ny = e.clientY - dragging.current.dy;
    if (Math.abs(nx - dock.current.x) + Math.abs(ny - dock.current.y) > 6) dragging.current.moved = true;
    if (dragging.current.moved) {
      x.set(nx);
      y.set(ny);
      sx.jump(nx);
      sy.jump(ny);
    }
  }
  function onPetPointerUp(e: React.PointerEvent) {
    document.body.classList.remove("select-none");
    if (resizing.current) {
      localStorage.setItem(SIZE_KEY, String(scale));
      resizing.current = null;
      return;
    }
    const wasDrag = dragging.current?.moved;
    dragging.current = null;
    if (wasDrag) {
      dock.current = {
        x: Math.min(Math.max(x.get(), 8), window.innerWidth - 40),
        y: Math.min(Math.max(y.get(), 8), window.innerHeight - 48),
      };
      localStorage.setItem(DOCK_KEY, JSON.stringify(dock.current));
    } else {
      setOpen((v) => !v);
    }
    void e;
  }

  if (!enabled) return null;

  const busy = chat && chat.status !== "idle";
  const size = 48 * scale;

  return (
    <motion.div ref={boxRef} style={{ x: sx, y: sy }} className="fixed left-0 top-0 z-[9998]">
      {/* Bubble */}
      {open && !traveling ? (
        <div
          className="absolute bottom-full mb-2 w-[300px] rounded-2xl border border-border bg-popover p-2.5 shadow-xl"
          style={{ right: -8 }}
        >
          <div className="flex items-center gap-1.5 pb-1.5">
            <AgentMark className="h-3.5 w-3.5 text-primary" active={Boolean(busy)} />
            <span className="text-[11px] font-medium text-foreground">
              {chat?.status === "thinking"
                ? "Thinking…"
                : chat?.status === "tool"
                  ? `I'm ${chat.toolLabel}…`
                  : chat?.status === "streaming"
                    ? "Answering…"
                    : "Ask me anything"}
            </span>
            <span className="ml-auto flex items-center gap-0.5">
              {onSpawn ? (
                <button
                  onClick={onSpawn}
                  title="Spawn another pet (own task session)"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Spawn pet"
                >
                  <Plus className="h-3 w-3" />
                </button>
              ) : null}
              {onClose ? (
                <button
                  onClick={onClose}
                  title="Dismiss this pet"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  aria-label="Dismiss pet"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
              <button
                onClick={() => setOpen(false)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>

          {chat && (chat.answer || chat.error || busy) ? (
            <div className="mb-2 max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-editor px-2.5 py-2">
              {chat.error ? (
                <p className="text-[11.5px] text-destructive">{chat.error}</p>
              ) : chat.answer ? (
                <div className="assistant-markdown text-[12px] leading-relaxed text-foreground">
                  <ReactMarkdown>{chat.answer}</ReactMarkdown>
                  {chat.status === "streaming" ? (
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse rounded-sm bg-primary/70 align-middle" />
                  ) : null}
                </div>
              ) : (
                <p className="agent-shimmer text-[11.5px]">
                  {chat.status === "tool" && chat.toolLabel ? `${chat.toolLabel}…` : "thinking…"}
                </p>
              )}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
              placeholder="e.g. connect and show my schemas…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            {busy ? (
              <button
                onClick={() => void stop()}
                aria-label="Stop"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={() => void ask()}
                disabled={!text.trim()}
                aria-label="Ask"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* The creature */}
      <div
        onPointerDown={onPetPointerDown}
        onPointerMove={onPetPointerMove}
        onPointerUp={onPetPointerUp}
        role="button"
        aria-label="Your Exasol AI pet — click to ask, drag to move"
        title="Click to ask · drag to move"
        className={cn("relative cursor-grab touch-none select-none active:cursor-grabbing")}
        style={{ width: size, height: size }}
      >
        <PetAvatar avatar={avatar} expression={expression} className="h-full w-full drop-shadow-lg" />
        {/* resize handle */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            resizing.current = { startY: e.clientY, startScale: scale };
          }}
          onPointerMove={onPetPointerMove}
          onPointerUp={onPetPointerUp}
          className="absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-full border border-border bg-panel opacity-0 shadow transition-opacity hover:opacity-100"
          title="Drag to resize"
        />
      </div>
    </motion.div>
  );
}
