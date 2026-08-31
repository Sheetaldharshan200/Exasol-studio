import { isTauri } from "@/lib/ipc";

/**
 * Space the native window controls need in the custom (overlay) title bar:
 * macOS traffic lights sit top-left, Windows min/max/close sit top-right.
 * Returns 0/0 in a plain browser (no native chrome).
 */
export function windowControlsInset(): { left: number; right: number } {
  if (!isTauri() || typeof navigator === "undefined") {
    return { left: 0, right: 0 };
  }
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return { left: 78, right: 0 };
  if (ua.includes("Win")) return { left: 0, right: 140 };
  return { left: 0, right: 0 };
}

/** Publish the insets as CSS variables so any title bar can reserve the space. */
export function applyWindowControlsInset(): void {
  const { left, right } = windowControlsInset();
  const root = document.documentElement;
  root.style.setProperty("--wc-left", `${left}px`);
  root.style.setProperty("--wc-right", `${right}px`);
}
