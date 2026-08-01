import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Loader2, RotateCw, X } from "lucide-react";
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
  const [minimized, setMinimized] = useState(false);
  // Bytes downloaded so far (shown as MB when the server gives no total).
  const [downloaded, setDownloaded] = useState(0);
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
          // Also surface it in the notification center (the bell), so it isn't
          // lost if the banner is dismissed. Deduped by title+body there, and
          // clicking it re-opens this banner via the "update" navigate target.
          window.dispatchEvent(
            new CustomEvent("studio:notice", {
              detail: {
                kind: "info",
                title: "Update available",
                body: `Exasol Studio ${u.version} is ready to download and install.`,
                go: "update",
              },
            }),
          );
        }
      } catch {
        /* no updater endpoint / offline / dev — ignore */
      }
    })();
  }, []);

  // Clicking the notification ("Update available") re-opens this banner even if
  // it was dismissed.
  useEffect(() => {
    const onNav = (e: Event) => {
      if ((e as CustomEvent<{ to?: string }>).detail?.to === "update") {
        setDismissed(false);
        setMinimized(false);
      }
    };
    window.addEventListener("studio:navigate", onNav);
    return () => window.removeEventListener("studio:navigate", onNav);
  }, []);

  if (!version || dismissed) return null;

  async function download() {
    const u = updateRef.current;
    if (!u) return;
    received.current = 0;
    total.current = null;
    setPct(null);
    setDownloaded(0);
    setErrMsg(null);
    setPhase("downloading");
    try {
      await u.download((e) => {
        if (e.event === "Started") {
          total.current = e.data.contentLength ?? null;
        } else if (e.event === "Progress") {
          received.current += e.data.chunkLength;
          setDownloaded(received.current);
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

  // Collapsed to a small pill so the update can keep going in the corner while
  // the user works. Shows live progress; click to reopen the full panel.
  if (minimized) {
    const label =
      phase === "downloading"
        ? pct !== null
          ? `${pct}%`
          : downloaded > 0
            ? formatMB(downloaded)
            : "Starting…"
        : phase === "installing"
          ? "Installing"
          : phase === "installed"
            ? "Restart"
            : phase === "error"
              ? "Update failed"
              : "Update";
    const busyPill = phase === "downloading" || phase === "installing";
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Show update"
        className="fixed bottom-4 right-4 z-[100] flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-popover px-3 text-[11.5px] font-medium text-foreground shadow-xl hover:border-primary/60"
      >
        {busyPill ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : phase === "installed" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        ) : phase === "error" ? (
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        ) : (
          <Download className="h-3.5 w-3.5 text-primary" />
        )}
        {label}
      </button>
    );
  }

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
            {phase === "downloading" &&
              (pct !== null
                ? `Downloading… ${pct}%`
                : downloaded > 0
                  ? `Downloading… ${formatMB(downloaded)}`
                  : "Starting the download…")}
            {phase === "downloaded" && "Downloaded and verified. Install it now."}
            {phase === "installing" && "Installing the update…"}
            {phase === "installed" && "Restart to finish. Your open tabs and AI sessions are kept."}
            {phase === "error" && (errMsg ?? "Something went wrong.")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            aria-label="Minimize"
            title="Minimize — keep it running in the corner"
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {phase === "available" || phase === "error" ? (
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* A calm, contained determinate bar only while downloading with a known
          size. No indeterminate/animated sliver — the phase text and the
          button spinner already convey activity, and the old animated loader
          escaped its container into a big glowing blob. */}
      {phase === "downloading" && pct !== null ? (
        <div className="relative mt-2.5 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
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

/** Bytes → a compact MB label, e.g. 12.3 MB (used when there's no total %). */
function formatMB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const btnPrimary =
  "flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60";
