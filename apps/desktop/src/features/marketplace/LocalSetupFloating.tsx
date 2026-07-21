import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown, ChevronUp, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react";
import { ipc, isTauri, type PersonalLocalStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type LogLine = { line: string; level: string };

/**
 * Global floating card that surfaces the Personal-Local + MCP bootstrap
 * progress anywhere in the app (not buried in the AI panel). Mirrors the
 * marketplace install experience: live status, expandable log, retry on
 * failure. Auto-dismisses shortly after a successful/ready state.
 */
export function LocalSetupFloating() {
  const [status, setStatus] = useState<PersonalLocalStatus | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevState = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void ipc
      .personalLocalStatus()
      .then((s) => {
        setStatus(s);
        prevState.current = s.state;
        // Already ready (or idle) at startup → don't nag; the card shows only
        // while installing or right after a real completion.
        if (s.state === "ready" || s.state === "idle") setDismissed(true);
      })
      .catch(() => undefined);
    const uns: Array<() => void> = [];
    void listen<PersonalLocalStatus>("personal-local:status", (e) => {
      const s = e.payload;
      const prev = prevState.current;
      prevState.current = s.state;
      setStatus(s);
      // Show for active work or a failure, and once when setup actually
      // finishes (installing → ready) — NOT on repeated ready re-polls.
      if (s.state === "installing" || s.state === "failed") setDismissed(false);
      else if (s.state === "ready" && prev === "installing") setDismissed(false);
    }).then((u) => uns.push(u));
    void listen<{ id: string; line: string; level: string }>("market:log", (e) => {
      if (e.payload.id !== "personal-local-bootstrap") return;
      setLogs((prev) => [...prev.slice(-200), { line: e.payload.line, level: e.payload.level }]);
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  // Keep the log view pinned to the newest line.
  useEffect(() => {
    if (expanded) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs, expanded]);

  // Auto-dismiss a little after everything is ready.
  useEffect(() => {
    if (status?.state === "ready") {
      const t = setTimeout(() => setDismissed(true), 6000);
      return () => clearTimeout(t);
    }
  }, [status?.state]);

  if (!status || status.state === "idle" || dismissed) return null;

  const failed = status.state === "failed";
  const installing = status.state === "installing";

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {installing ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : failed ? (
          <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Check className="h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-foreground">
            {failed ? "Local setup failed" : status.state === "ready" ? "Local Exasol ready" : "Setting up local Exasol"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={status.message}>
            {status.state === "ready" ? "Your local database and AI tools are ready." : status.message}
          </div>
        </div>
        {logs.length > 0 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={expanded ? "Hide log" : "Show log"}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {!installing ? (
          <button
            onClick={() => setDismissed(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {expanded && logs.length > 0 ? (
        <div
          ref={logRef}
          className="max-h-52 overflow-y-auto border-t border-border bg-editor px-3 py-2 font-mono text-[10.5px] leading-relaxed"
        >
          {logs.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-words",
                l.level === "err" ? "text-destructive" : l.level === "success" ? "text-primary" : l.level === "cmd" ? "text-muted-foreground" : "text-foreground/80",
              )}
            >
              {l.line}
            </div>
          ))}
        </div>
      ) : null}

      {failed ? (
        <div className="flex justify-end gap-1.5 border-t border-border px-3 py-2">
          <button
            onClick={() => {
              setLogs([]);
              void ipc.personalLocalBootstrap().catch(() => undefined);
            }}
            className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <RotateCcw className="h-3 w-3" /> Retry setup
          </button>
        </div>
      ) : null}
    </div>
  );
}
