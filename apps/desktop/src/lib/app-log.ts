/**
 * Webview diagnostics tail: console.error/warn, window.onerror and unhandled
 * rejections are buffered and appended to `<data>/logs/webview.log` via the
 * Rust side, because the release webview has no visible console — "black
 * screen" bugs died unrecorded before this. Batched + capped, never throws.
 */

const buffer: string[] = [];
let flushTimer: number | null = null;
let invokeFn: ((cmd: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;

function flush() {
  flushTimer = null;
  if (!invokeFn || buffer.length === 0) return;
  const lines = buffer.splice(0, buffer.length).join("");
  invokeFn("append_app_log", { lines }).catch(() => undefined);
}

function log(level: string, parts: unknown[]) {
  try {
    const text = parts
      .map((p) => {
        if (typeof p === "string") return p;
        if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ""}`;
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      })
      .join(" ")
      .slice(0, 4000);
    buffer.push(`${new Date().toISOString()} [${level}] ${text}\n`);
    if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
    flushTimer ??= window.setTimeout(flush, 1500);
  } catch {
    /* never let logging break the app */
  }
}

/** Install the tee. Call once, as early as possible. */
export function installAppLog(): void {
  if (!("__TAURI_INTERNALS__" in window)) return; // web build: console suffices
  void import("@tauri-apps/api/core").then((m) => {
    invokeFn = m.invoke as typeof invokeFn;
    log("info", ["--- app start ---"]);
  });

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    log("error", args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    log("warn", args);
    origWarn(...args);
  };
  window.addEventListener("error", (e) => {
    log("uncaught", [e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    log("unhandled-rejection", [e.reason]);
  });
}
