import { isTauri } from "@/lib/ipc";

export const AI_PROVIDERS_WINDOW_LABEL = "ai-providers";

/** Cross-window event fired after provider keys change so panels refresh. */
export const EV_AI_PROVIDERS_CHANGED = "ai-providers-changed";

/** True when the current webview is the standalone AI Providers window. */
export function isAiProvidersWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === AI_PROVIDERS_WINDOW_LABEL;
}

/** Open AI provider setup in a separate native window (Tauri). */
export async function openAiProvidersWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const existing = (await getAllWebviewWindows()).find((w) => w.label === AI_PROVIDERS_WINDOW_LABEL);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const win = new WebviewWindow(AI_PROVIDERS_WINDOW_LABEL, {
      url: `index.html?view=${AI_PROVIDERS_WINDOW_LABEL}`,
      title: "AI Providers",
      width: 620,
      height: 640,
      center: true,
      resizable: true,
      minWidth: 520,
      minHeight: 480,
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://created", () => resolve());
      win.once("tauri://error", (e) => reject(e));
    });
    return true;
  } catch (err) {
    console.error("openAiProvidersWindow failed", err);
    return false;
  }
}
