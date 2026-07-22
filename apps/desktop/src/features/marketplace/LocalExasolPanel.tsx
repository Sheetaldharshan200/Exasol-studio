import { useEffect, useRef, useState } from "react";
import { CircleStop, Info, Loader2, Play, RefreshCcw, Server, Trash2, X } from "lucide-react";
import { errorMessage, ipc, isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Action = "status" | "info" | "start" | "stop" | "destroy";
type Line = { level: string; text: string };

const CTL_ID = "exasol-local";

const ACTIONS: { key: Action; label: string; Icon: typeof Play; danger?: boolean }[] = [
  { key: "start", label: "Start", Icon: Play },
  { key: "stop", label: "Stop", Icon: CircleStop },
  { key: "status", label: "Status", Icon: RefreshCcw },
  { key: "info", label: "Info", Icon: Info },
  { key: "destroy", label: "Destroy", Icon: Trash2, danger: true },
];

/**
 * Control the Studio-managed local runtime (native Personal on macOS, Nano on
 * Windows/Linux) straight from the app. Streams lifecycle output live over the
 * `market:log` / `market:done` events (id `exasol-local`).
 */
export function LocalExasolPanel({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState<Action | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Subscribe to the launcher's streamed output.
  useEffect(() => {
    if (!isTauri()) return;
    let offLog: (() => void) | undefined;
    let offDone: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      offLog = await listen<{ id: string; line: string; level: string }>("market:log", (e) => {
        if (e.payload.id !== CTL_ID) return;
        setLines((prev) => [...prev, { level: e.payload.level, text: e.payload.line }]);
      });
      offDone = await listen<{ id: string; ok: boolean }>("market:done", (e) => {
        if (e.payload.id !== CTL_ID) return;
        setRunning(null);
      });
    })();
    return () => {
      offLog?.();
      offDone?.();
    };
  }, []);

  // Auto-scroll to the newest line.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  async function run(action: Action) {
    if (running) return;
    if (action === "destroy" && !confirmDestroy) {
      setConfirmDestroy(true);
      return;
    }
    setConfirmDestroy(false);
    setRunning(action);
    setLines((prev) => [...prev, { level: "cmd", text: `$ studio local-exasol ${action}` }]);
    try {
      const r = await ipc.exasolLocalCtl(action);
      if (!isTauri()) {
        setLines((prev) => [
          ...prev,
          { level: "out", text: `(preview) local runtime ${action} → ok` },
          { level: "success", text: `Local runtime ${action} finished.` },
        ]);
        setRunning(null);
        void r;
      }
    } catch (e) {
      setLines((prev) => [...prev, { level: "err", text: `${errorMessage(e)}` }]);
      setRunning(null);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[70vh] w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Server className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[13px] font-semibold text-foreground">Local Exasol — deployment control</span>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {ACTIONS.map(({ key, label, Icon, danger }) => (
            <button
              key={key}
              onClick={() => void run(key)}
              disabled={running !== null}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium disabled:opacity-50",
                danger
                  ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "border-border text-foreground hover:bg-secondary",
                confirmDestroy && key === "destroy" && "border-destructive bg-destructive/15",
              )}
            >
              {running === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {confirmDestroy && key === "destroy" ? "Confirm destroy" : label}
            </button>
          ))}
        </div>

        <div
          ref={logRef}
          className="flex-1 overflow-auto bg-editor p-3 font-mono text-[11.5px] leading-relaxed [scrollbar-width:thin]"
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground">
              Manage native Exasol Personal on macOS or Exasol Nano through Docker/Podman on Windows and Linux. Run <span className="text-foreground">Status</span> to check
              whether it is up, then <span className="text-foreground">Start</span> / <span className="text-foreground">Stop</span>{" "}
              as needed. Studio-owned lifecycle output streams here.
            </p>
          ) : (
            lines.map((l, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  l.level === "cmd" && "text-primary",
                  l.level === "err" && "text-destructive",
                  l.level === "success" && "text-primary",
                  (l.level === "out" || l.level === "info") && "text-foreground/80",
                )}
              >
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
