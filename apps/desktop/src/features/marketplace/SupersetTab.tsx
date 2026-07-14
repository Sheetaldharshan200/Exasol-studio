import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BarChart3, ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { errorMessage, ipc, isTauri } from "@/lib/ipc";

/**
 * Apache Superset embedded inside an Exasol Studio tab. Starts the local
 * Superset server, waits until it answers, then shows it in an in-app iframe —
 * no separate window, no system browser.
 */
export function SupersetTab() {
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [url, setUrl] = useState("http://localhost:8088");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      setStatus("starting");
      setError(null);
      try {
        const launched = await ipc.biLaunch();
        if (launched) setUrl(launched);
        // Poll until Superset answers (first boot takes a few seconds).
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
        if (!cancelled.current) setStatus("ready");
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
    if (isTauri()) void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(url)).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <BarChart3 className="h-4 w-4 text-primary" />
        <span className="text-[12.5px] font-semibold text-foreground">Apache Superset</span>
        <span className="font-mono text-[11px] text-muted-foreground">{url}</span>
        {status === "ready" ? (
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

      <div className="relative min-h-0 flex-1">
        {status === "starting" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-[13px]">Starting Superset… first launch takes a few seconds.</p>
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="max-w-md text-[13px] text-destructive">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : (
          <iframe
            key={reloadKey}
            src={url}
            title="Apache Superset"
            className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
