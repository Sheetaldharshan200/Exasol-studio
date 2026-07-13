import { isTauri } from "@/lib/ipc";

export const SETTINGS_WINDOW_LABEL = "settings";

/** True when the current webview is the standalone Settings window. */
export function isSettingsWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === SETTINGS_WINDOW_LABEL;
}

/** Open Settings in a separate native window (Tauri). Returns false in a browser. */
export async function openSettingsWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const existing = (await getAllWebviewWindows()).find((w) => w.label === SETTINGS_WINDOW_LABEL);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const win = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
      url: `index.html?view=${SETTINGS_WINDOW_LABEL}`,
      title: "Settings",
      width: 1000,
      height: 680,
      center: true,
      resizable: true,
      minWidth: 780,
      minHeight: 520,
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://created", () => resolve());
      win.once("tauri://error", (e) => reject(e));
    });
    return true;
  } catch (err) {
    console.error("openSettingsWindow failed", err);
    return false;
  }
}
