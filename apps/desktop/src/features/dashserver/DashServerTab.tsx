// The Dashboards tab hosts dash-server — the ecosystem's dashboard host —
// inside Studio. Studio starts it for a connection, lists its hosted apps
// through the server's own inventory, and renders the chosen app in a frame.
// The frame is the component's UI; this header is all Studio adds. The
// agent builds dashboards here through dash-server's MCP.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Loader2, Play, RefreshCcw, Square } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon as BxIcon } from "@/components/ui/icon";
import { errorMessage, ipc, type DashApp, type DashServerStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Conn = { profileId: string; connectionName: string } | null;
type Profile = { id: string; name: string };

function openExternal(url: string) {
  ipc.openExternal(url).catch(() => window.open(url, "_blank", "noopener"));
}

export function DashServerTab({ connection }: { connection: Conn }) {
  const [status, setStatus] = useState<DashServerStatus | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState(connection?.profileId ?? "");
  const [apps, setApps] = useState<DashApp[] | null>(null);
  const [app, setApp] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    const s = await ipc.dashServerStatus().catch(() => null);
    if (!live.current) return;
    setStatus(s);
    if (s?.serving) {
      const list = await ipc.dashServerApps().catch(() => []);
      if (!live.current) return;
      setApps(list);
      setApp((cur) => cur && list.some((a) => a.name === cur) ? cur : (list.find((a) => a.published)?.name ?? list[0]?.name ?? null));
    } else {
      setApps(null);
    }
  }, []);

  useEffect(() => {
    live.current = true;
    void refresh();
    void ipc.listConnectionProfiles().then((list) => {
      if (!live.current) return;
      const flat = list.map((p) => ({ id: p.id, name: p.name }));
      setProfiles(flat);
      if (!profileId && flat.length === 1) setProfileId(flat[0].id);
    });
    return () => {
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const profile = profiles.find((p) => p.id === profileId) ?? (connection && connection.profileId === profileId ? { id: connection.profileId, name: connection.connectionName } : undefined);

  async function start() {
    if (!profile) return;
    setBusy("start");
    setError(null);
    try {
      await ipc.dashServerStart(profile.id);
      await refresh();
    } catch (e) {
      if (live.current) setError(errorMessage(e));
    } finally {
      if (live.current) setBusy(null);
    }
  }
  async function stop() {
    setBusy("stop");
    try {
      await ipc.dashServerStop();
      await refresh();
    } finally {
      if (live.current) setBusy(null);
    }
  }

  function openMarketplaceItem() {
    window.dispatchEvent(new CustomEvent("studio:navigate", { detail: { to: "marketplace" } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("studio:marketplace-search", { detail: { query: "dash-server" } })), 120);
  }

  const current = apps?.find((a) => a.name === app) ?? null;
  const frameUrl = status?.serving && current ? `${status.url}${current.route}` : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
        <BxIcon name="dashboard-grid" className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground">Dashboards</span>
        <span className="text-muted-foreground">dash-server, inside Studio</span>
        <span className="mx-1 h-4 w-px bg-border" />
        {status && !status.installed ? (
          <>
            <span className="text-foreground">dash-server is not installed on this machine.</span>
            <button onClick={openMarketplaceItem} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/85">
              <BxIcon name="extension" className="h-3.5 w-3.5" /> Install from the Marketplace
            </button>
            <button onClick={() => void refresh()} className="text-muted-foreground hover:text-foreground">Check again</button>
          </>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Connection dash-server queries" disabled={busy !== null} className="flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-foreground hover:bg-secondary disabled:opacity-50">
                  <BxIcon name="database" className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{status?.serving && status.profileName ? status.profileName : profile?.name ?? "Choose a connection"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Dashboards query</DropdownMenuLabel>
                {profiles.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => setProfileId(p.id)}>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === profileId ? <Check className="h-3 w-3" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {status?.serving ? (
              <>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" /> answering on {status.url.replace("http://", "")}
                </span>
                {status.profileId ? (
                  <button onClick={() => void stop()} disabled={busy !== null} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-foreground hover:bg-secondary disabled:opacity-50">
                    {busy === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Stop
                  </button>
                ) : null}
                {profile && status.profileId && status.profileId !== profile.id ? (
                  <button onClick={() => void start()} disabled={busy !== null} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-foreground hover:bg-secondary disabled:opacity-50">
                    <RefreshCcw className="h-3.5 w-3.5" /> Restart for {profile.name}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                onClick={() => void start()}
                disabled={!profile || busy !== null || status === null}
                title={!profile ? "Choose the connection dash-server should query." : undefined}
                className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {busy === "start" ? "Starting…" : status === null ? "Checking…" : "Start dash-server"}
              </button>
            )}
            {apps && apps.length > 0 ? (
              <DropdownMenu onOpenChange={(o) => o && void refresh()}>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Hosted app" className="ml-auto flex h-7 max-w-[260px] items-center gap-1 rounded-md border border-border bg-background px-2 text-foreground hover:bg-secondary">
                    <span className="truncate">{current?.title ?? "Choose an app"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Hosted apps</DropdownMenuLabel>
                  {apps.map((a) => (
                    <DropdownMenuItem key={a.name} onClick={() => setApp(a.name)}>
                      <span className="flex-1 truncate">{a.title}</span>
                      <span className={cn("text-[10px]", a.status === "running" ? "text-primary" : "text-muted-foreground")}>{a.status}</span>
                      {a.name === app ? <Check className="ml-2 h-3 w-3" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : status?.serving ? (
              <span className="ml-auto text-muted-foreground">No apps yet — ask Exa for a dashboard.</span>
            ) : null}
            {frameUrl ? (
              <>
                <button onClick={() => setFrameKey((k) => k + 1)} title="Reload" aria-label="Reload the app" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <RefreshCcw className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => openExternal(frameUrl)} title="Open in the browser" aria-label="Open in the browser" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </>
        )}
        {error ? <span className="basis-full text-destructive">{error}</span> : null}
      </div>
      <div className="min-h-0 flex-1">
        {frameUrl ? (
          <iframe key={`${frameUrl}-${frameKey}`} src={frameUrl} title={current?.title ?? "Dashboard"} className="h-full w-full border-0 bg-background" />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-[12px] text-muted-foreground">
            <div className="max-w-md">
              <p className="text-foreground">Dashboards are built by dash-server and shown here.</p>
              <p className="mt-2">
                {status && !status.installed
                  ? "Install dash-server from the Marketplace, then start it for a connection."
                  : status?.serving
                    ? "Ask Exa for a dashboard — it builds the app in dash-server and it appears in the list above."
                    : "Pick the connection dash-server should query and start it. The agent then builds dashboards against that connection."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
