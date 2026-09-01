import { useEffect, useState } from "react";
import { InstallConsole } from "@/features/marketplace/Marketplace";
import { readMetaSnapshot, resolveCatalog } from "@/features/marketplace/catalog-data";
import { ipc, type MarketEnv } from "@/lib/ipc";
import { installParams, INSTALL_DONE } from "@/lib/install-window";

/** Standalone window that runs a single Marketplace install independently. */
export function InstallWindow() {
  const params = installParams();
  // Same dynamic resolution as the marketplace: last-known GitHub metadata
  // snapshot, repo-tail fallback — this window never blocks on a fetch.
  const item = resolveCatalog(readMetaSnapshot()).find((c) => c.id === params?.id) ?? null;
  const [env, setEnv] = useState<MarketEnv | null>(null);

  useEffect(() => {
    ipc.marketEnv().then(setEnv).catch(() => undefined);
  }, []);

  if (!params || !item) {
    return <div className="flex h-screen items-center justify-center bg-editor text-sm text-muted-foreground">Unknown install target.</div>;
  }

  const asset = params.assetUrl && params.assetName ? { name: params.assetName, url: params.assetUrl, size: 0 } : null;

  return (
    <div className="h-screen w-screen bg-editor">
      <InstallConsole
        item={item}
        env={env}
        asset={asset}
        embedded
        version={params.version}
        onDone={async () => {
          const { emit } = await import("@tauri-apps/api/event");
          void emit(INSTALL_DONE, { id: item.id });
        }}
        onClose={async () => {
          const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          void getCurrentWebviewWindow().close();
        }}
      />
    </div>
  );
}
