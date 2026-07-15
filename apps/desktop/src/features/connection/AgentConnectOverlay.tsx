import { useEffect, useRef, useState } from "react";
import { Loader2, PlugZap, X } from "lucide-react";
import { AgentMark } from "@/components/studio/AgentMark";
import { cn } from "@/lib/utils";

// The agent's human-style connect: it "types" the details in front of you,
// then WAITS — you connect, adjust anything inline, or cancel. Errors land
// right here, not in a hidden log.

export type ConnectDraft = {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  schema?: string;
  notes?: string;
};

export function AgentConnectOverlay({
  draft,
  onConnect,
  onCancel,
  error,
  connecting,
}: {
  draft: ConnectDraft;
  onConnect: (final: ConnectDraft) => void;
  onCancel: () => void;
  error: string | null;
  connecting: boolean;
}) {
  const [values, setValues] = useState<ConnectDraft>({ ...draft, host: "", username: "", password: "", name: "" });
  const [typed, setTyped] = useState(false);

  // Type the values in like a person would (fast but visible).
  const target = useRef(draft);
  useEffect(() => {
    target.current = draft;
    let i = 0;
    const fields: (keyof ConnectDraft)[] = ["name", "host", "username", "password"];
    const timers: number[] = [];
    const typeField = (fi: number) => {
      if (fi >= fields.length) {
        setValues((v) => ({ ...v, port: draft.port, schema: draft.schema, notes: draft.notes }));
        setTyped(true);
        return;
      }
      const key = fields[fi];
      const full = String(draft[key] ?? "");
      i = 0;
      const t = window.setInterval(() => {
        i += 1;
        setValues((v) => ({ ...v, [key]: full.slice(0, i) }));
        if (i >= full.length) {
          window.clearInterval(t);
          timers.splice(timers.indexOf(t), 1);
          typeField(fi + 1);
        }
      }, 24);
      timers.push(t);
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValues(draft);
      setTyped(true);
    } else {
      typeField(0);
    }
    return () => timers.forEach((t) => window.clearInterval(t));
  }, [draft]);

  function set<K extends keyof ConnectDraft>(key: K, val: ConnectDraft[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div data-agent-id="agent-overlay" className="w-[380px] rounded-2xl border border-border bg-popover p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <AgentMark className="h-4 w-4 text-primary" active={connecting || !typed} />
          <span className="text-[13px] font-semibold text-foreground">
            {connecting ? "Connecting…" : typed ? "Ready — connect, or adjust anything" : "Filling in the details…"}
          </span>
          <button
            onClick={onCancel}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          <Field label="Name" value={values.name} onChange={(v) => set("name", v)} />
          <div className="flex gap-2">
            <Field label="Host" value={values.host} onChange={(v) => set("host", v)} className="flex-1" />
            <Field
              label="Port"
              value={String(values.port || "")}
              onChange={(v) => set("port", Number(v) || 8563)}
              className="w-24"
            />
          </div>
          <div className="flex gap-2">
            <Field label="Username" value={values.username} onChange={(v) => set("username", v)} className="flex-1" />
            <Field
              label="Password"
              type="password"
              value={values.password}
              onChange={(v) => set("password", v)}
              className="flex-1"
            />
          </div>
          <Field
            label="Description (optional)"
            value={values.notes ?? ""}
            onChange={(v) => set("notes", v)}
            placeholder="What is this connection for?"
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px] text-foreground">
            {error}
          </div>
        ) : null}

        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="flex h-8 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onConnect(values)}
            disabled={!typed || connecting || !values.host || !values.username}
            className="cta-glow flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12.5px] outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
      />
    </label>
  );
}
