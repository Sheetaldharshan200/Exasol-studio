import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert, Info, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeKind = "info" | "success" | "warning";
type Notice = { id: string; kind: NoticeKind; title: string; body: string; time: string; read: boolean };

const SEED: Notice[] = [
  {
    id: "n1",
    kind: "success",
    title: "Welcome to Exasol Studio",
    body: "Connect to a database to browse schemas and run your first query.",
    time: "just now",
    read: false,
  },
  {
    id: "n2",
    kind: "info",
    title: "Native driver ready",
    body: "sqlx-exasol is set as the default connection driver.",
    time: "1m ago",
    read: false,
  },
];

const KIND_ICON = { info: Info, success: Zap, warning: CircleAlert } as const;
const KIND_TONE = {
  info: "text-info",
  success: "text-primary",
  warning: "text-warning",
} as const;

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>(SEED);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function markAllRead() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
  }

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
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[8px] font-bold text-primary-foreground">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute top-8 right-0 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="eyebrow-muted">Notifications</span>
            {unread > 0 ? (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 border-b border-border px-3.5 py-3 last:border-0",
                      !n.read && "bg-secondary/40",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", KIND_TONE[n.kind])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {n.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {n.time}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                    </div>
                    {!n.read ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
