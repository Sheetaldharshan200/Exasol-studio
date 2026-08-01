import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCw, X } from "lucide-react";
import { isTauri } from "@/lib/ipc";

// Mirrors @tauri-apps/plugin-updater's Update (the bits we use) + its progress
// events, so we can drive an explicit Download → Install → Restart flow.
type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };
type Update = {
  version: string;
  currentVersion?: string;
  download: (onEvent?: (e: DownloadEvent) => void) => Promise<void>;
  install: () => Promise<void>;
};

type Phase = "available" | "downloading" | "downloaded" | "installing" | "installed" | "error";

/**
 * In-app updater. Checks the signed GitHub release for a newer build and walks
 * the user through it with visible phases: download (with a real byte-progress
 * bar), install, then a Restart button. The relaunch swaps only the app binary
 * — open tabs and AI sessions are restored on the next launch, so nothing is
 * lost. Silent when up to date or running in the browser.
 */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [pct, setPct] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const updateRef = useRef<Update | null>(null);
  // Download progress accounting (bytes streamed vs. the announced total).
  const received = useRef(0);
  const total = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = (await check()) as unknown as Update | null;
        if (u && u.version) {
          updateRef.current = u;
          setVersion(u.version);
        }
      } catch {
        /* no updater endpoint / offline / dev — ignore */
      }
    })();
  }, []);

  if (!version || dismissed) return null;

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
        if (e.event === "Started") {
          total.current = e.data.contentLength ?? null;
        } else if (e.event === "Progress") {
          received.current += e.data.chunkLength;
          setPct(total.current ? Math.min(100, Math.round((received.current / total.current) * 100)) : null);
        } else if (e.event === "Finished") {
          setPct(100);
        }
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

  const showBar = phase === "downloading" || phase === "installing";
  const indeterminate = phase === "installing" || (phase === "downloading" && pct === null);

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-80 rounded-xl border border-primary/40 bg-popover p-3.5 text-[12.5px] text-foreground shadow-2xl">
      <div className="flex items-start gap-2.5">
        {phase === "installed" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : phase === "error" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {phase === "installed" ? (
              "Update ready"
            ) : phase === "error" ? (
              "Update failed"
            ) : (
              <>
                Exasol Studio <span className="font-semibold">{version}</span> is available
              </>
            )}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {phase === "available" && "A newer signed build is ready to download."}
            {phase === "downloading" && (pct !== null ? `Downloading… ${pct}%` : "Downloading…")}
            {phase === "downloaded" && "Downloaded and verified. Install it now."}
            {phase === "installing" && "Installing the update…"}
            {phase === "installed" && "Restart to finish. Your open tabs and AI sessions are kept."}
            {phase === "error" && (errMsg ?? "Something went wrong.")}
          </p>
        </div>
        {phase === "available" || phase === "error" ? (
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showBar ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-secondary">
          {indeterminate ? (
            <div className="exa-indeterminate" />
          ) : (
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} />
          )}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        {phase === "available" && (
          <button onClick={download} className={btnPrimary}>
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        )}
        {phase === "downloading" && (
          <button disabled className={btnPrimary}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading…
          </button>
        )}
        {phase === "downloaded" && (
          <button onClick={install} className={btnPrimary}>
            <Download className="h-3.5 w-3.5" /> Install
          </button>
        )}
        {phase === "installing" && (
          <button disabled className={btnPrimary}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Installing…
          </button>
        )}
        {phase === "installed" && (
          <button onClick={restart} className={btnPrimary}>
            <RotateCw className="h-3.5 w-3.5" /> Restart now
          </button>
        )}
        {phase === "error" && (
          <button onClick={download} className={btnPrimary}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary =
  "flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60";
