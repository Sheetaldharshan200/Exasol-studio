import { isTauri, type ConnectionProfile } from "@/lib/ipc";

export type Draft = Omit<ConnectionProfile, "id"> & { id?: string };
export type ConnectRequest = { draft: Draft; mode: "test" | "connect" };

export const CONNECT_WINDOW_LABEL = "connect-run";
export const EV_READY = "connect:ready";
export const EV_REQUEST = "connect:request";
export const EV_ESTABLISHED = "connect:established";
export const EV_TESTED = "connect:tested";

/** True when the current webview is the dedicated connect window. */
export function isConnectWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === CONNECT_WINDOW_LABEL;
}

/**
 * Open the connect flow in a separate native window (Tauri). Returns false in a
 * plain browser so the caller can fall back to the in-app floating window.
 * A ready/request handshake hands the draft to the new window reliably.
 */
export async function openConnectWindow(req: ConnectRequest): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const [{ WebviewWindow, getAllWebviewWindows }, { emit, once }] = await Promise.all([
      import("@tauri-apps/api/webviewWindow"),
      import("@tauri-apps/api/event"),
    ]);

    // Reuse the window if it's already open.
    const existing = (await getAllWebviewWindows()).find((w) => w.label === CONNECT_WINDOW_LABEL);
    if (existing) {
      await existing.setFocus();
      await emit(EV_REQUEST, req);
      return true;
    }

    const win = new WebviewWindow(CONNECT_WINDOW_LABEL, {
      url: `index.html?view=${CONNECT_WINDOW_LABEL}`,
      title: req.mode === "connect" ? "Connect to Exasol" : "Test connection",
      width: 820,
      height: 470,
      resizable: true,
      center: true,
      minWidth: 640,
      minHeight: 380,
    });

    // The new window announces readiness; then we hand it the request.
    await once(EV_READY, async () => {
      await emit(EV_REQUEST, req);
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://created", () => resolve());
      win.once("tauri://error", (e) => reject(e));
    });
    return true;
  } catch (err) {
    console.error("openConnectWindow failed, falling back to in-app window", err);
    return false;
  }
}
