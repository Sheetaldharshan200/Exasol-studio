import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Database,
  Loader2,
  Radio,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  ipc,
  type ConnectionProfile,
  type ServerInfo,
} from "@/lib/ipc";

type Draft = Omit<ConnectionProfile, "id"> & { id?: string };
type StepState = "idle" | "running" | "ok" | "fail";
type LogLevel = "info" | "success" | "error";
type LogLine = { id: number; ts: string; level: LogLevel; text: string };

const STEP_META: { key: "reach" | "auth" | "db"; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "reach", label: "Ping server", hint: "TCP reachability", icon: Radio },
  { key: "auth", label: "Authenticate", hint: "Verify credentials", icon: ShieldCheck },
  { key: "db", label: "Open database", hint: "Read server info", icon: Database },
];

let logId = 0;

export function ConnectRunOverlay({
  open,
  mode,
  draft,
  variant = "floating",
  onClose,
  onSaved,
  onConnected,
  onDone,
}: {
  open: boolean;
  mode: "test" | "connect";
  draft: Draft;
  variant?: "floating" | "page";
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onConnected: (profile: ConnectionProfile, server: ServerInfo) => void | Promise<void>;
  onDone?: (status: "ok" | "fail") => void;
}) {
  const [steps, setSteps] = useState<Record<"reach" | "auth" | "db", StepState>>({
    reach: "idle",
    auth: "idle",
    db: "idle",
  });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [done, setDone] = useState<null | "ok" | "fail">(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Keep the latest props in a ref so the run effect can fire exactly once
  // per open (no re-runs from changing object identities → no flicker/dupes).
  const latest = useRef({ draft, mode, onSaved, onConnected, onDone });
  latest.current = { draft, mode, onSaved, onConnected, onDone };
  const startedRef = useRef(false);
  const dragOrigin = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const clock = () => new Date().toLocaleTimeString([], { hour12: false });

  const onDragMove = useCallback((e: PointerEvent) => {
    const o = dragOrigin.current;
    if (!o) return;
    setPos({ x: o.ox + (e.clientX - o.px), y: o.oy + (e.clientY - o.py) });
  }, []);
  const onDragEnd = useCallback(() => {
    dragOrigin.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  }, [onDragMove]);
  function startDrag(e: React.PointerEvent) {
    if (variant !== "floating") return;
    dragOrigin.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  }

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    const { draft: d, mode: m, onSaved: saved, onConnected: connected } = latest.current;
    let cancelled = false;

    setSteps({ reach: "idle", auth: "idle", db: "idle" });
    setLogs([]);
    setDone(null);
    setPos({ x: 0, y: 0 });

    const finish = (status: "ok" | "fail") => {
      setDone(status);
      latest.current.onDone?.(status);
    };
    const append = (level: LogLevel, text: string) =>
      setLogs((l) => [...l, { id: ++logId, ts: clock(), level, text }]);
    const setStep = (key: "reach" | "auth" | "db", state: StepState) =>
      setSteps((s) => ({ ...s, [key]: state }));

    (async () => {
      setStep("reach", "running");
      append("info", `Pinging ${d.host}:${d.port} …`);
      try {
        const ping = await ipc.pingServer(d.host, d.port);
        if (cancelled) return;
        if (!ping.reachable) {
          setStep("reach", "fail");
          append("error", ping.error ?? "Server unreachable.");
          finish("fail");
          return;
        }
        setStep("reach", "ok");
        append("success", `Server reachable — ${ping.latencyMs} ms.`);
      } catch (err) {
        if (cancelled) return;
        setStep("reach", "fail");
        append("error", errorMessage(err));
        finish("fail");
        return;
      }

      setStep("auth", "running");
      append("info", `Authenticating as ${d.username} (encryption: ${d.sslMode}) …`);
      try {
        let server: ServerInfo;
        let profile: ConnectionProfile | null = null;
        if (m === "test") {
          server = await ipc.testConnection(d);
        } else {
          profile = await ipc.saveConnectionProfile(d);
          await saved();
          append("info", "Connection saved. Opening session …");
          server = await ipc.connect(profile.id);
        }
        if (cancelled) return;
        setStep("auth", "ok");
        append("success", "Authenticated.");
        setStep("db", "ok");
        append(
          "success",
          `Database ready — ${server.databaseName ?? "exasol"} ${server.version ?? ""} · session ${server.sessionId}.`,
        );
        finish("ok");
        if (m === "connect" && profile) {
          append("success", "Connected. Opening the workbench …");
          setTimeout(() => {
            if (!cancelled) void connected(profile!, server);
          }, 650);
        }
      } catch (err) {
        if (cancelled) return;
        setSteps((s) => ({ ...s, auth: s.auth === "running" ? "fail" : s.auth, db: "idle" }));
        append("error", errorMessage(err));
        finish("fail");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => () => onDragEnd(), [onDragEnd]);

  if (!open) return null;

  const statusBadge = done ? (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        done === "ok" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
      )}
    >
      {done === "ok" ? (mode === "connect" ? "connected" : "success") : "failed"}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> running
    </span>
  );

  const body = (
    <>
      <div
        onPointerDown={startDrag}
        className={cn(
          "flex h-11 shrink-0 items-center justify-between border-b border-border px-4 select-none",
          variant === "floating" && "cursor-move",
        )}
        data-tauri-drag-region={variant === "page" ? "" : undefined}
      >
        <div className="flex items-center gap-3">
          {variant === "floating" ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                aria-label="Close"
                className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f56]"
              >
                <X className="h-2 w-2 text-black/60 opacity-0 group-hover:opacity-100" />
              </button>
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
            </div>
          ) : null}
          <span className="eyebrow">{mode === "connect" ? "Connecting" : "Testing connection"}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {draft.username}@{draft.host}:{draft.port}
          </span>
        </div>
        {statusBadge}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 space-y-2 border-r border-border p-4">
          <span className="eyebrow-muted">Steps</span>
          <div className="mt-2 space-y-2">
            {STEP_META.map((step) => {
              const state = steps[step.key];
              const Icon = step.icon;
              return (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                    state === "ok" && "border-primary/40 bg-primary/5",
                    state === "fail" && "border-destructive/40 bg-destructive/5",
                    (state === "idle" || state === "running") && "border-border bg-secondary/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      state === "ok" && "bg-primary/15 text-primary",
                      state === "fail" && "bg-destructive/15 text-destructive",
                      (state === "idle" || state === "running") && "bg-secondary text-muted-foreground",
                    )}
                  >
                    {state === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : state === "ok" ? (
                      <Check className="h-4 w-4" />
                    ) : state === "fail" ? (
                      <CircleAlert className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground">{step.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{step.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-editor">
            {/* terminal-style window header */}
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="eyebrow-muted ml-1">Log</span>
            </div>
            {/* structured log table */}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse font-mono text-[12px]">
                <thead className="sticky top-0 bg-secondary/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="border-b border-border px-3 py-1.5 font-medium">Time</th>
                    <th className="border-b border-border px-2 py-1.5 font-medium">Status</th>
                    <th className="border-b border-border px-3 py-1.5 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((line) => (
                    <tr key={line.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-1 align-top whitespace-nowrap text-muted-foreground/70">
                        {line.ts}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                            line.level === "success" && "bg-primary/15 text-primary",
                            line.level === "error" && "bg-destructive/15 text-destructive",
                            line.level === "info" && "bg-secondary text-muted-foreground",
                          )}
                        >
                          {line.level === "success" ? "OK" : line.level === "error" ? "FAILED" : "RUN"}
                        </span>
                      </td>
                      <td className="px-3 py-1 align-top whitespace-pre-wrap text-foreground/90">
                        {line.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {done ? (
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-border px-4">
          <button
            onClick={onClose}
            className="flex h-8 items-center rounded-lg border border-border px-3 text-[13px] text-muted-foreground hover:text-foreground"
          >
            {done === "fail" ? "Back" : "Close"}
          </button>
        </div>
      ) : null}
    </>
  );

  if (variant === "page") {
    return <div className="flex h-screen w-full flex-col overflow-hidden bg-background">{body}</div>;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div
        className="flex h-[420px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        {body}
      </div>
    </div>
  );
}
