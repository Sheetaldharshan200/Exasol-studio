import { useState } from "react";
import { Check, Copy, Database, Plug, Server } from "lucide-react";
import type { ActiveConnection } from "@/state/useConnections";
import { cn } from "@/lib/utils";

/**
 * Read-only overview of a single connection: the saved profile (host, driver,
 * encryption…) plus live server/session facts from when it was established.
 */
export function ConnectionInfoPanel({ connection }: { connection: ActiveConnection }) {
  const { profile, server } = connection;
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  };

  const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const fmtDate = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  };

  const Row = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => (
    <div className="group flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-40 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">{value}</span>
      {copyable && value !== "—" ? (
        <button
          onClick={() => copy(label, value)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          title={`Copy ${label}`}
        >
          {copied === label ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );

  const Section = ({ icon: Icon, title, children }: { icon: typeof Server; title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-border bg-panel/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="h-full overflow-auto bg-editor [scrollbar-width:thin]">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-bold text-foreground">{profile.name}</h2>
            <p className="font-mono text-[12px] text-muted-foreground">
              {profile.host}:{profile.port}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
            Connected
          </span>
        </div>

        <Section icon={Plug} title="Connection">
          <Row label="Name" value={dash(profile.name)} />
          <Row label="Host" value={dash(profile.host)} copyable />
          <Row label="Port" value={dash(profile.port)} />
          <Row label="User" value={dash(profile.username)} copyable />
          <Row label="Initial schema" value={dash(profile.schema)} />
          <Row label="Driver" value={dash(profile.driverId)} />
          <Row label="Encryption" value={dash(profile.sslMode)} />
          <Row label="Compression" value={profile.compression ? "On" : "Off"} />
          {profile.notes ? <Row label="Notes" value={profile.notes} /> : null}
        </Section>

        <Section icon={Server} title="Server & session">
          <Row label="Database" value={dash(server.databaseName)} />
          <Row label="Version" value={dash(server.version)} copyable />
          <Row label="Current user" value={dash(server.currentUser)} />
          <Row label="Current schema" value={dash(server.currentSchema)} />
          <Row label="Session ID" value={dash(server.sessionId)} copyable />
          <Row label="Cluster nodes" value={dash(server.nodes)} />
        </Section>

        <Section icon={Database} title="History">
          <Row label="Created" value={fmtDate(profile.createdAt)} />
          <Row label="Last used" value={fmtDate(profile.lastUsedAt)} />
        </Section>
      </div>
    </div>
  );
}
