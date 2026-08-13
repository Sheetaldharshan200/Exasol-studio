import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck, CircleAlert, Info, Sparkles, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedListItem } from "@/components/ui/animated-list";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type NoticeKind = "info" | "success" | "warning";
type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** ISO timestamp — rendered as a live relative label. */
  at: string;
  read: boolean;
  /** Navigation target — clicking the notice goes there ("git", "notebook",
   *  "marketplace:updates", "bi", "skills", or "file:<path>" to reveal). */
  go?: string;
};

/** Mail-like persistence: notices stay until the user deletes them, across
 * restarts. Stored locally, capped so it can never grow unbounded. */
const STORE_KEY = "exasol-notices-v1";
const STORE_CAP = 200;

function loadNotices(): Notice[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as (Notice & { time?: string })[];
      // Migrate any pre-persistence entries that carried a frozen label.
      return list
        .filter((n) => n && n.id && n.title)
        .map((n) => ({ ...n, at: n.at ?? new Date().toISOString() }));
    }
  } catch {
    /* fall through to the first-run seed */
  }
  return [
    {
      id: "n1",
      kind: "success",
      title: "Welcome to Exasol Studio",
      body: "Connect to a database to browse schemas and run your first query.",
      at: new Date().toISOString(),
      read: false,
    },
  ];
}

/** "just now" → "5m ago" → "3h ago" → a date, computed at render time. */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}

const KIND_ICON = { info: Info, success: Zap, warning: CircleAlert } as const;
// Each kind gets its own tinted icon chip — semantic color, readable in both themes.
const KIND_CHIP: Record<NoticeKind, string> = {
  info: "bg-info/12 text-info",
  success: "bg-primary/12 text-primary",
  warning: "bg-warning/12 text-warning",
};

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>(() => loadNotices());
  // Persist every change so notices survive close/reopen (kept until deleted).
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, STORE_CAP)));
    } catch {
      /* storage full/unavailable — the dropdown still works in-memory */
    }
  }, [items]);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  // Live notices from the backend (Tauri event) AND from the frontend (a
  // window CustomEvent, e.g. the agent's git auto-commit).
  useEffect(() => {
    const push = (n: { kind?: NoticeKind; title: string; body: string; go?: string }) =>
      setItems((list) => {
        // Mail-like, not nagging: the same notice (title+body) re-emitted on a
        // later launch must not pile up as a duplicate.
        if (list.some((x) => x.title === n.title && x.body === n.body)) return list;
        return [
          {
            id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind: n.kind ?? "info",
            title: n.title,
            body: n.body,
            go: n.go,
            at: new Date().toISOString(),
            read: false,
          },
          ...list,
        ];
      });
    const onWin = (e: Event) => {
      const d = (e as CustomEvent<{ kind?: NoticeKind; title: string; body: string; go?: string }>).detail;
      if (d?.title) push(d);
    };
    window.addEventListener("studio:notice", onWin);
    let un: UnlistenFn | undefined;
    if (isTauri()) {
      void listen<{ kind: NoticeKind; title: string; body: string; go?: string }>("studio:notice", (e) => push(e.payload)).then(
        (u) => (un = u),
      );
    }
    return () => {
      window.removeEventListener("studio:notice", onWin);
      un?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = () => setItems((list) => list.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) => setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  const dismiss = (id: string) => setItems((list) => list.filter((n) => n.id !== id));
  const clearAll = () => setItems([]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={cn(
          "relative flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          open && "bg-secondary text-foreground",
        )}
      >
        <Bell className="h-3.5 w-3.5" />
        <AnimatePresence>
          {unread > 0 ? (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[8px] font-bold text-primary-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-8 right-0 z-50 w-[22rem] origin-top-right overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">Notifications</span>
                {unread > 0 ? (
                  <span className="rounded-full bg-primary/15 px-1.5 py-px font-mono text-[10px] font-medium text-primary">
                    {unread} new
                  </span>
                ) : null}
              </div>
              {items.length > 0 ? (
                <div className="flex items-center gap-1">
                  {unread > 0 ? (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Mark all read
                    </button>
                  ) : null}
                  <button
                    onClick={clearAll}
                    className="rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-3.5 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <BellOff className="h-4 w-4" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">You&apos;re all caught up</p>
                  <p className="max-w-[16rem] text-xs text-muted-foreground">
                    Component updates, connection events, and setup progress will show up here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {items.map((n) => {
                      // Unknown kinds (bad dispatch, stale persisted data)
                      // must never crash the whole app at mount.
                      const Icon = KIND_ICON[n.kind] ?? Info;
                      return (
                        <AnimatedListItem key={n.id}>
                          <button
                            onClick={() => {
                              markRead(n.id);
                              if (n.go) {
                                window.dispatchEvent(new CustomEvent("studio:navigate", { detail: { to: n.go } }));
                                setOpen(false);
                              }
                            }}
                            title={n.go ? "Open" : undefined}
                            className={cn(
                              "group relative flex w-full gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                              n.read
                                ? "border-transparent hover:bg-secondary/50"
                                : "border-border bg-secondary/40 hover:bg-secondary/70",
                              n.go && "cursor-pointer hover:border-primary/40",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                                KIND_CHIP[n.kind] ?? KIND_CHIP.info,
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[13px] font-medium text-foreground">{n.title}</span>
                                <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground">
                                  {timeAgo(n.at)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                            </div>
                            {!n.read ? (
                              <span className="absolute top-3 left-0 h-6 w-0.5 rounded-r bg-primary" />
                            ) : null}
                            <span
                              role="button"
                              tabIndex={-1}
                              aria-label="Dismiss"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismiss(n.id);
                              }}
                              className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-background hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          </button>
                        </AnimatedListItem>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {items.length > 0 ? (
              <div className="flex items-center gap-1.5 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary/70" />
                Studio watches official releases and tells you when a component update is available.
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
