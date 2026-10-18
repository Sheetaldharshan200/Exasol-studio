// The text "Copy diagnostics" puts on the clipboard for a bug report:
// versions, the system and the recent log. No connection details.

import type { AboutInfo } from "./ipc.ts";

export function diagnosticsText(info: AboutInfo, extra: { userAgent?: string; log?: string } = {}): string {
  const lines = [
    `Exasol Studio ${info.appVersion}`,
    `Tauri ${info.tauriVersion}`,
    `OS: ${[info.os, info.arch].filter(Boolean).join(" ")}`.trim(),
    extra.userAgent ? `Webview: ${extra.userAgent}` : "",
  ].filter(Boolean);
  const log = extra.log?.trim();
  return log ? `${lines.join("\n")}\n\nRecent log:\n${log}\n` : `${lines.join("\n")}\n`;
}
