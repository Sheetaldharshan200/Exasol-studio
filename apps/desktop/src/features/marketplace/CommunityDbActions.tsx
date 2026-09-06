// The Exasol Community database card actions — full exasol/docker-db lifecycle:
// real Docker checks (installed → engine running → platform), LIVE version tags
// from Docker Hub, pull+run with the officially documented flags, and
// start/stop/remove. Renders inside the Marketplace card for the
// `community-docker` install kind; all state comes from the community_* Rust
// commands, streamed progress arrives on market:log (job id community-db).

import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { AlertTriangle, Check, ChevronDown, Download, Loader2, Play, RefreshCcw, Square, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ipc, isTauri, type CommunityStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const JOB_ID = "community-db";

export function CommunityDbActions() {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [versions, setVersions] = useState<string[] | null>(null);
  const [tag, setTag] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState<string[]>([]);

  const refresh = useCallback(() => {
    ipc.communityStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => refresh(), [refresh]);

  // Live tags, fetched once the engine facts are known (Docker Hub — not the
  // rate-limited GitHub API).
  useEffect(() => {
    if (versions !== null) return;
    ipc
      .communityVersions()
      .then((v) => {
        setVersions(v);
        setTag((cur) => cur || v[0] || "");
      })
      .catch(() => setVersions([]));
  }, [versions]);

  // Streamed docker pull/run/boot progress while an operation is in flight.
  useEffect(() => {
    if (!busy || !isTauri()) return;
    let un: UnlistenFn | undefined;
    void listen<{ id: string; line: string }>("market:log", (e) => {
      if (e.payload.id !== JOB_ID) return;
      setLive((prev) => [...prev.slice(-4), e.payload.line]);
    }).then((u) => (un = u));
    return () => {
      un?.();
      setLive([]);
    };
  }, [busy]);

  async function run(label: string, op: () => Promise<CommunityStatus>) {
    setBusy(label);
    setNote(null);
    try {
      setStatus(await op());
      setNote(label === "install" ? "Community database is up — sys/exasol." : null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const connect = () =>
    window.dispatchEvent(new CustomEvent("studio:connect-profile", { detail: { name: "Exasol Community (Docker)" } }));

  const pill = "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium disabled:opacity-50";
  const primary = `${pill} bg-primary text-primary-foreground hover:bg-primary/85`;
  const quiet = `${pill} border border-border text-muted-foreground hover:bg-secondary hover:text-foreground`;

  if (!status) {
    return (
      <span className="flex h-7 items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Docker…
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {/* Platform truth up front: amd64-only image, upstream supports Linux. */}
      {!status.native ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {status.arch} host — the amd64 image runs emulated (upstream supports Docker on Linux). Experimental: slower boot and queries.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!status.dockerInstalled ? (
          <>
            <span className="text-[12px] text-muted-foreground">
              Needs Docker — macOS: <code className="rounded bg-muted px-1">brew install colima docker && colima start</code>
            </span>
            <button className={quiet} onClick={refresh}>
              <RefreshCcw className="h-3.5 w-3.5" /> Re-check
            </button>
          </>
        ) : !status.engineRunning ? (
          <>
            <span className="text-[12px] text-muted-foreground">
              Docker is installed but not running — start it (<code className="rounded bg-muted px-1">colima start</code> or Docker Desktop).
            </span>
            <button className={quiet} onClick={refresh}>
              <RefreshCcw className="h-3.5 w-3.5" /> Re-check
            </button>
          </>
        ) : !status.containerExists ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={quiet} disabled={Boolean(busy)} aria-label="Community database version">
                  {versions === null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span className="font-mono">{tag || (versions?.length === 0 ? "no versions?" : "version…")}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {(versions ?? []).map((v) => (
                  <DropdownMenuItem key={v} onClick={() => setTag(v)} className="font-mono text-[12px]">
                    {v}
                    {v === tag ? <Check className="ml-auto h-3 w-3" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button className={cn(primary, "cta-glow")} disabled={Boolean(busy) || !tag} onClick={() => void run("install", () => ipc.communityInstall(tag))}>
              {busy === "install" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy === "install" ? "Installing…" : `Install & run ${tag}`}
            </button>
          </>
        ) : (
          <>
            <span className={cn("flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px]", status.running ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status.running ? "bg-primary" : "bg-muted-foreground/60")} />
              {status.running ? "running" : "stopped"}
              {status.tag ? <span className="font-mono text-[10.5px] text-muted-foreground">{status.tag}</span> : null}
            </span>
            {status.running ? (
              <>
                <button className={primary} onClick={connect}>
                  Connect
                </button>
                <button className={quiet} disabled={Boolean(busy)} onClick={() => void run("stop", () => ipc.communityControl("stop"))}>
                  {busy === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Stop
                </button>
              </>
            ) : (
              <button className={primary} disabled={Boolean(busy)} onClick={() => void run("start", () => ipc.communityControl("start"))}>
                {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
              </button>
            )}
            <button
              className={quiet}
              disabled={Boolean(busy)}
              title="Remove the container (the data volume is kept and reused on reinstall)"
              onClick={() => void run("remove", () => ipc.communityControl("remove"))}
            >
              {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
            </button>
          </>
        )}
      </div>

      {status.containerExists || status.running ? (
        <p className="font-mono text-[10.5px] text-muted-foreground">
          127.0.0.1:{status.dbPort} · user {status.user} · password exasol · BucketFS https :{status.bucketfsPort} · ≤10 GiB data
        </p>
      ) : null}

      {busy && live.length ? (
        <div className="rounded-md border border-border bg-panel px-2 py-1 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          {live.map((l, i) => (
            <p key={i} className={cn("truncate", i === live.length - 1 && "text-foreground")}>{l}</p>
          ))}
        </div>
      ) : null}
      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}
