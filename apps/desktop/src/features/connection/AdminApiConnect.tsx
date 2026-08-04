import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug, ShieldCheck, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage, ipc, type AdminApiStatus } from "@/lib/ipc";

/**
 * Admin API (ConfD) session state + inline connect form, shared by the
 * native-backup and database-control surfaces (admin-api-parity spec).
 * The password goes IN once and never comes back; nothing is persisted.
 */
export function useAdminApi(profileId: string) {
  const [status, setStatus] = useState<AdminApiStatus>({ connected: false });
  const refresh = useCallback(() => {
    ipc.confdStatus(profileId).then(setStatus).catch(() => setStatus({ connected: false }));
  }, [profileId]);
  useEffect(() => refresh(), [refresh]);
  return { status, refresh };
}

export function AdminApiConnect({
  profileId,
  defaultHost,
  status,
  onChanged,
}: {
  profileId: string;
  defaultHost: string;
  status: AdminApiStatus;
  onChanged: () => void;
}) {
  const [host, setHost] = useState(defaultHost);
  const [port, setPort] = useState("20003");
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[12px]">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span>
          Admin API connected — <span className="font-mono">{status.user}@{status.host}:{status.port}</span>
        </span>
        <button
          onClick={() => void ipc.confdDisconnect(profileId).then(onChanged)}
          className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          <Unplug className="h-3 w-3" /> Disconnect
        </button>
      </div>
    );
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await ipc.confdConnect(profileId, host.trim(), parseInt(port, 10) || 20003, user.trim(), password);
      setPassword("");
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium">
        <Plug className="h-3.5 w-3.5 text-primary" /> Connect the Admin API (ConfD)
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        Native cluster administration talks to ConfD on the cluster's admin port (default 20003) with an{" "}
        <span className="font-mono">admin</span>/exaadm user. The connection is TLS (self-signed certificates are
        accepted for this session); the password stays in the backend for this app session only and is never stored.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" aria-label="Admin host"
          className="h-7 w-40 rounded-md border border-border bg-editor px-2 font-mono text-[12px] outline-none focus:border-primary/50" />
        <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="20003" aria-label="Admin port"
          className="h-7 w-16 rounded-md border border-border bg-editor px-2 text-center font-mono text-[12px] outline-none focus:border-primary/50" />
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="admin" aria-label="Admin user"
          className="h-7 w-24 rounded-md border border-border bg-editor px-2 font-mono text-[12px] outline-none focus:border-primary/50" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password" aria-label="Admin password"
          onKeyDown={(e) => { if (e.key === "Enter" && password) void connect(); }}
          className="h-7 w-36 rounded-md border border-border bg-editor px-2 font-mono text-[12px] outline-none focus:border-primary/50" />
        <button
          onClick={() => void connect()}
          disabled={busy || !host.trim() || !user.trim() || !password}
          className={cn("flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50")}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Connect
        </button>
      </div>
      {error ? <p className="mt-1.5 font-mono text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
