import { isTauri } from "@/lib/ipc";

export const AI_PROVIDERS_WINDOW_LABEL = "ai-providers";

/** Cross-window event fired after provider keys change so panels refresh. */
export const EV_AI_PROVIDERS_CHANGED = "ai-providers-changed";

/** True when the current webview is the standalone AI Providers window. */
export function isAiProvidersWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === AI_PROVIDERS_WINDOW_LABEL;
}

/** Open AI settings as a WORKSPACE TAB in the main window (like Marketplace).
 *  Works from the main window and from other native windows (Settings) via a
 *  cross-window event; falls back to a DOM event outside Tauri. */
export async function openAiProvidersWindow(): Promise<boolean> {
  if (isTauri()) {
    try {
      const [{ emit }, { getCurrentWebviewWindow }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/webviewWindow"),
      ]);
      await emit("open-ai-settings-tab");
      // Bring the main window forward when called from another native window.
      const current = getCurrentWebviewWindow();
      if (current.label !== "main") {
        const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
        const main = (await getAllWebviewWindows()).find((w) => w.label === "main");
        await main?.setFocus();
      }
      return true;
    } catch (err) {
      console.error("openAiProvidersWindow failed", err);
      return false;
    }
  }
  window.dispatchEvent(new CustomEvent("studio:open-ai-settings"));
  return true;
}
