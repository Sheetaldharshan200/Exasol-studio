// Panorama inside Studio, with Studio as its shell. The frame shows the
// Marketplace-installed web build served on Studio's own scheme; the bridge
// script in that page sends Panorama's shell commands here by postMessage,
// and this answers the few Studio can — the database proxy, the saved
// connections as deployments, one connection's credential at the click.

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { Icon as BxIcon } from "@/components/ui/icon";
import { errorMessage, ipc, type PanoramaStatus } from "@/lib/ipc";
import { answer, frameOrigin, frameUrl, parseRequest, zoomStepFromKey } from "./bridge";

export function PanoramaTab() {
  const [status, setStatus] = useState<PanoramaStatus | null | { error: string }>(null);
  const [frameKey, setFrameKey] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await ipc.panoramaStatus();
      if (live.current) setStatus(s);
    } catch (e) {
      if (live.current) setStatus({ error: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    live.current = true;
    void refresh();
    return () => {
      live.current = false;
    };
  }, [refresh]);

  // Answer the frame's shell commands. Only messages from this tab's own
  // frame count, and replies go to that frame's origin, never to "*".
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || event.source !== win) return;
      const req = parseRequest(event.data);
      if (!req) return;
      const s = status && !("error" in status) ? status : null;
      void answer(req, {
        proxyUrl: () => s?.proxyUrl ?? null,
        deployments: () => ipc.panoramaDeployments(),
        credentials: (name) => ipc.panoramaCredentials(name),
      }).then(
        (result) => win.postMessage({ panoramaShellReply: 1, id: req.id, ok: true, result }, frameOrigin(navigator.userAgent)),
        (e) => win.postMessage({ panoramaShellReply: 1, id: req.id, ok: false, error: errorMessage(e) }, frameOrigin(navigator.userAgent)),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [status]);

  // ⌘/Ctrl + = / - typed outside the frame still zooms Panorama's canvas:
  // the frame's shim turns the step into the wheel gesture Panorama reads.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = zoomStepFromKey(e);
      const win = frame.current?.contentWindow;
      if (!step || !win) return;
      e.preventDefault();
      win.postMessage({ panoramaShellZoom: 1, step }, frameOrigin(navigator.userAgent));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openMarketplaceItem() {
    window.dispatchEvent(new CustomEvent("studio:navigate", { detail: { to: "marketplace" } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("studio:marketplace-search", { detail: { query: "panorama" } })), 120);
  }

  const installed = status !== null && !("error" in status) && status.installed;
  const url = frameUrl(navigator.userAgent);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
        <BxIcon name="grid" className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground">Panorama</span>
        <span className="text-muted-foreground">exploration canvas, inside Studio — pick a saved connection in its connection panel</span>
        {status && "error" in status ? <span className="text-destructive">{status.error}</span> : null}
        {installed ? (
          <>
            <button onClick={() => setFrameKey((k) => k + 1)} title="Reload" aria-label="Reload Panorama" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => ipc.openExternal("https://github.com/exasol-labs/exasol-panorama")} title="Panorama on GitHub" aria-label="Panorama on GitHub" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </>
        ) : status !== null && !("error" in status) ? (
          <>
            <span className="text-foreground">Panorama's web build is not installed on this machine.</span>
            <button onClick={openMarketplaceItem} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/85">
              <BxIcon name="extension" className="h-3.5 w-3.5" /> Install from the Marketplace
            </button>
            <button onClick={() => void refresh()} className="text-muted-foreground hover:text-foreground">Check again</button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {installed ? (
          <iframe key={frameKey} ref={frame} src={url} title="Panorama" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerPolicy="no-referrer" className="h-full w-full border-0 bg-background" />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-[12px] text-muted-foreground">
            <div className="max-w-md">
              <p className="text-foreground">Every result a box on an infinite plane, every arrow where it came from.</p>
              <p className="mt-2">Install Panorama's web build from the Marketplace; Studio serves it here and acts as its shell, so your saved connections — including the local database with its self-signed certificate — are one click away in its connection panel.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
