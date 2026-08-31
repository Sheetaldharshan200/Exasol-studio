import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { NewVirtualSchema } from "@/features/connection/NewVirtualSchema";
import { VS_DONE, VS_READY, VS_REQUEST, type VsRequest } from "@/lib/vs-window";

/**
 * Full-page contents of the dedicated (native) virtual-schema window. Waits for
 * the main window to hand over which connection to target, renders the wizard,
 * then emits the result back and closes.
 */
export function VirtualSchemaWindow() {
  const [req, setReq] = useState<VsRequest | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { emit, listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<VsRequest>(VS_REQUEST, (e) => setReq(e.payload));
      await emit(VS_READY, {});
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
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
        </span>
      </div>
    );
  }

  return (
    <NewVirtualSchema
      variant="page"
      profileId={req.profileId}
      connectionName={req.connectionName}
      onClose={closeWindow}
      onCreated={async () => {
        const { emit } = await import("@tauri-apps/api/event");
        await emit(VS_DONE, { profileId: req.profileId });
        await closeWindow();
      }}
    />
  );
}
