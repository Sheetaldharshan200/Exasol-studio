import { isTauri } from "@/lib/ipc";

export const VS_WINDOW_LABEL = "vschema";
export const VS_READY = "vschema:ready";
export const VS_REQUEST = "vschema:request";
export const VS_DONE = "vschema:done";

export type VsRequest = { profileId: string; connectionName: string };

/** True when the current webview is the dedicated virtual-schema window. */
export function isVsWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === VS_WINDOW_LABEL;
}

/**
 * Open the New Virtual Schema flow in a separate native window (Tauri). Returns
 * false in a plain browser so the caller can fall back to an in-app modal.
 */
export async function openVsWindow(req: VsRequest): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const [{ WebviewWindow, getAllWebviewWindows }, { emit, once }] = await Promise.all([
      import("@tauri-apps/api/webviewWindow"),
      import("@tauri-apps/api/event"),
    ]);

    const existing = (await getAllWebviewWindows()).find((w) => w.label === VS_WINDOW_LABEL);
    if (existing) {
      await existing.setFocus();
      await emit(VS_REQUEST, req);
      return true;
    }

    const win = new WebviewWindow(VS_WINDOW_LABEL, {
      url: `index.html?view=${VS_WINDOW_LABEL}`,
      title: "New Virtual Schema",
      width: 900,
      height: 640,
      center: true,
      resizable: true,
      minWidth: 700,
      minHeight: 480,
    });

    await once(VS_READY, async () => {
      await emit(VS_REQUEST, req);
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://created", () => resolve());
      win.once("tauri://error", (e) => reject(e));
    });
    return true;
  } catch (err) {
    console.error("openVsWindow failed, falling back to in-app modal", err);
    return false;
  }
}
