import { ipc, isTauri } from "@/lib/ipc";

/**
 * Open a URL or file path FROM CHAT/UI text the right way: http(s) in the
 * system browser (never navigating the webview), absolute file paths as a
 * workspace editor tab (read via IPC), and anything else is ignored rather
 * than guessed.
 */
export function looksLikePath(value: string): boolean {
  return /^(\/|~\/)[\w.\-/ ]+$/.test(value.trim());
}

export function openLinkOrPath(target: string): void {
  const t = target.trim();
  if (/^https?:\/\//i.test(t)) {
    if (isTauri()) void ipc.openExternal(t).catch(() => window.open(t, "_blank"));
    else window.open(t, "_blank", "noopener");
    return;
  }
  if (looksLikePath(t)) {
    void (async () => {
      try {
        const content = await ipc.fsReadText(t.replace(/^~\//, `${await homeDir()}/`));
        window.dispatchEvent(
          new CustomEvent("studio:open-text-tab", { detail: { name: t.split("/").pop() ?? t, content } }),
        );
      } catch {
        window.dispatchEvent(
          new CustomEvent("studio:notice", {
            detail: { kind: "warning", title: "Couldn't open the file", body: t },
          }),
        );
      }
    })();
  }
}

async function homeDir(): Promise<string> {
  try {
    const { homeDir: h } = await import("@tauri-apps/api/path");
    return (await h()).replace(/\/$/, "");
  } catch {
    return "";
  }
}
