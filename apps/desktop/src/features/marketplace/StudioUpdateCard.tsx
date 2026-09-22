// Exasol Studio's OWN update card on Marketplace → Updates: current version,
// live check against the signed GitHub release, then an explicit Download
// (byte progress) → Install → Restart flow driven by the same
// @tauri-apps/plugin-updater machinery as the launch banner. Restart is safe
// by design: workspace state (open tabs, connections, AI sessions) persists on
// disk and is restored on the next launch — the update swaps only the binary.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, RefreshCcw, RotateCw, ShieldCheck } from "lucide-react";
import { isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

// Mirrors @tauri-apps/plugin-updater's Update (the bits we use).
type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };
type Update = {
  version: string;
  download: (onEvent?: (e: DownloadEvent) => void) => Promise<void>;
  install: () => Promise<void>;
};

type Phase = "checking" | "current" | "available" | "downloading" | "downloaded" | "installing" | "installed" | "error";

export function StudioUpdateCard() {
  const [appVersion, setAppVersion] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("checking");
  const [next, setNext] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const received = useRef(0);
  const total = useRef<number | null>(null);

  async function check() {
    setPhase("checking");
    setErrMsg(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = (await check()) as unknown as Update | null;
      if (u?.version) {
        updateRef.current = u;
        setNext(u.version);
        setPhase("available");
      } else {
        setNext(null);
        setPhase("current");
      }
    } catch (err) {
      // No updater endpoint (dev build) or offline — report honestly.
      setErrMsg(err instanceof Error ? err.message : "Could not reach the update service.");
      setPhase("error");
    }
  }

  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/api/app").then(({ getVersion }) => getVersion().then(setAppVersion)).catch(() => undefined);
    void check();
  }, []);

  async function download() {
    const u = updateRef.current;
    if (!u) return;
    received.current = 0;
    total.current = null;
    setPct(null);
    setErrMsg(null);
    setPhase("downloading");
    try {
      await u.download((e) => {
        if (e.event === "Started") total.current = e.data.contentLength ?? null;
        else if (e.event === "Progress") {
          received.current += e.data.chunkLength;
          setPct(total.current ? Math.min(100, Math.round((received.current / total.current) * 100)) : null);
        } else if (e.event === "Finished") setPct(100);
      });
      setPhase("downloaded");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Download failed.");
      setPhase("error");
    }
  }

  async function install() {
    const u = updateRef.current;
    if (!u) return;
    setPhase("installing");
    try {
      await u.install();
      setPhase("installed");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Install failed.");
      setPhase("error");
    }
  }

  async function restart() {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Restart failed — quit and reopen the app.");
      setPhase("error");
    }
  }

  if (!isTauri()) return null;

  const btn = "flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60";
  const quiet = "flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50";

  return (
    <section className="mb-4 rounded-xl border border-border bg-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="flex-1 text-[12.5px] font-semibold text-foreground">Exasol Studio</h3>
        <button onClick={() => void check()} disabled={phase === "checking" || phase === "downloading" || phase === "installing"} title="Check for a new Studio release" className={quiet}>
          <RefreshCcw className={cn("h-3 w-3", phase === "checking" && "animate-spin")} /> Check
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1">
        <div className="min-w-40 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
            <span>installed {appVersion || "—"}</span>
            {next ? <span>official {next}</span> : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            The update swaps only the app binary — open tabs, connections and AI sessions are kept on disk and restored after the restart.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {phase === "checking" ? (
            <span className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </span>
          ) : phase === "current" ? (
            <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" /> Up to date
            </span>
          ) : phase === "available" ? (
            <button onClick={() => void download()} className={btn}>
              <Download className="h-3.5 w-3.5" /> Download {next}
            </button>
          ) : phase === "downloading" ? (
            <span className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading{pct !== null ? ` ${pct}%` : "…"}
            </span>
          ) : phase === "downloaded" ? (
            <button onClick={() => void install()} className={btn}>
              <Download className="h-3.5 w-3.5" /> Install {next}
            </button>
          ) : phase === "installing" ? (
            <span className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Installing…
            </span>
          ) : phase === "installed" ? (
            <button onClick={() => void restart()} className={cn(btn, "cta-glow")}>
              <RotateCw className="h-3.5 w-3.5" /> Restart Studio
            </button>
          ) : null}
        </div>
      </div>

      {phase === "error" && errMsg ? (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-warning" />
          {errMsg}
        </p>
      ) : null}
    </section>
  );
}
