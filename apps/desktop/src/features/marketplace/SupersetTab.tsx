import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCcw } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { errorMessage, ipc, isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Apache Superset embedded inside an Exasol Studio tab. Starts the local
 * Superset server, waits until it answers, then shows it in an in-app iframe.
 * A branded loading screen covers the boot + first paint so there's no jarring
 * white flash before Superset's own UI renders.
 */
export function SupersetTab() {
  const [status, setStatus] = useState<"starting" | "serving" | "error">("starting");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [url, setUrl] = useState("http://localhost:8088");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setStatus("starting");
    setFrameLoaded(false);
    setError(null);
    (async () => {
      try {
        const launched = await ipc.biLaunch();
        if (launched) setUrl(launched);
        if (isTauri()) {
          const deadline = Date.now() + 60_000;
          while (Date.now() < deadline && !cancelled.current) {
            try {
              await fetch(launched, { mode: "no-cors" });
              break;
            } catch {
              await new Promise((r) => window.setTimeout(r, 900));
            }
          }
        }
        if (!cancelled.current) setStatus("serving");
      } catch (e) {
        if (!cancelled.current) {
          setError(errorMessage(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [reloadKey]);

  const openExternal = () => {
    if (isTauri()) void ipc.openExternal(url).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank");
  };

  const showLoader = status === "starting" || (status === "serving" && !frameLoaded);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-[12.5px] font-semibold text-foreground">Apache Superset</span>
        <span className="font-mono text-[11px] text-muted-foreground">{url}</span>
        {status === "serving" && frameLoaded ? (
          <span className="rounded bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">login admin / admin</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={openExternal}
            title="Open in external browser"
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Browser <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-editor">
        {/* The iframe is mounted as soon as the server is up, but kept invisible
            until it has fully painted — so the branded loader covers the flash. */}
        {status === "serving" ? (
          <iframe
            key={reloadKey}
            src={url}
            title="Apache Superset"
            onLoad={() => setFrameLoaded(true)}
            className={cn("absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-300", frameLoaded ? "opacity-100" : "opacity-0")}
            allow="clipboard-read; clipboard-write"
          />
        ) : null}

        {showLoader ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-editor">
            <BrandLoader size={72} />
            <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              {status === "starting" ? "Starting Superset…" : "Loading dashboards…"}
            </div>
            <p className="text-[11.5px] text-muted-foreground/70">First launch takes a few seconds.</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-editor px-6 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="max-w-md text-[13px] text-destructive">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
