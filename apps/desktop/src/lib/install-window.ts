import { isTauri } from "@/lib/ipc";

export type InstallParams = { id: string; version?: string; assetUrl?: string; assetName?: string };

/** True when the current webview is a standalone install window. */
export function isInstallWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === "install";
}

export function installParams(): InstallParams | null {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("id");
  if (!id) return null;
  return {
    id,
    version: p.get("version") || undefined,
    assetUrl: p.get("assetUrl") || undefined,
    assetName: p.get("assetName") || undefined,
  };
}

/** Event the install window emits after a successful install so the main
 *  window refreshes its installed state. */
export const INSTALL_DONE = "market:refresh-installed";

/**
 * Open a dedicated floating window that runs the install for one item —
 * independent of the main window, so several installs can run at once.
 * Returns false in a browser (caller falls back to the in-app console).
 */
export async function openInstallWindow(
  item: { id: string; name: string },
  asset?: { url: string; name: string },
  version?: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const label = `install-${item.id}`;
    const existing = (await getAllWebviewWindows()).find((w) => w.label === label);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const qs = new URLSearchParams({ view: "install", id: item.id });
    if (version) qs.set("version", version);
    if (asset?.url) qs.set("assetUrl", asset.url);
    if (asset?.name) qs.set("assetName", asset.name);
    new WebviewWindow(label, {
      url: `index.html?${qs.toString()}`,
      title: `Install · ${item.name}`,
      width: 660,
      height: 540,
      center: true,
      resizable: true,
      minWidth: 520,
      minHeight: 420,
    });
    return true;
  } catch (err) {
    console.error("openInstallWindow failed", err);
    return false;
  }
}
