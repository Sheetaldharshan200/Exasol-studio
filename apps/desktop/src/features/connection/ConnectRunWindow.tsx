import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ConnectRunOverlay } from "@/features/connection/ConnectRunOverlay";
import { BrandLoader } from "@/components/brand/BrandLoader";
import {
  EV_ESTABLISHED,
  EV_READY,
  EV_REQUEST,
  EV_TESTED,
  type ConnectRequest,
} from "@/lib/connect-window";

/**
 * Full-page contents of the dedicated (native) connect window. It waits for
 * the main window to hand over the connection request, runs the ping → auth →
 * connect flow, then emits the result back and closes itself.
 */
export function ConnectRunWindow() {
  const [req, setReq] = useState<ConnectRequest | null>(null);
  // Bumped on every incoming request so the overlay remounts and re-runs its
  // flow — critical when the window is reused (e.g. Test, then Connect).
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { emit, listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<ConnectRequest>(EV_REQUEST, (e) => {
        setReq(e.payload);
        setRunId((n) => n + 1);
      });
      // Announce readiness so the opener sends the request.
      await emit(EV_READY, {});
    })();
    return () => unlisten?.();
  }, []);

  async function closeWindow() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }

  if (!req) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <BrandLoader size={56} />
        <span className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing connection…
        </span>
      </div>
    );
  }

  return (
    <ConnectRunOverlay
      key={runId}
      open
      variant="page"
      mode={req.mode}
      draft={req.draft}
      onClose={closeWindow}
      onSaved={() => undefined}
      onConnected={async (profile, server) => {
        const { emit } = await import("@tauri-apps/api/event");
        await emit(EV_ESTABLISHED, { profile, server });
        await closeWindow();
      }}
      onDone={async (status) => {
        // Report the test result back so the opener can show a ✓ on "Test".
        if (req.mode === "test") {
          const { emit } = await import("@tauri-apps/api/event");
          await emit(EV_TESTED, { ok: status === "ok" });
        }
      }}
    />
  );
}
