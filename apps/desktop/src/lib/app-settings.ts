// The app-wide settings the Settings window edits, with their defaults. Every
// key here must have a reader that changes behaviour — settings-inventory.test
// checks that, so a toggle can never again exist only as a toggle. Settings
// that had no behaviour were retired (settings.rs scrubs them from disk).

export type SettingValue = string | number | boolean;

export const APP_SETTING_DEFAULTS: Record<string, SettingValue> = {
  theme: "system",
  showSystemSchemas: true,
  editorFontSize: 13,
  editorFontFamily: "JetBrains Mono",
  wordWrap: false,
  stmtNumbers: true,
  autoComplete: true,
  sqlLinting: true,
  aiGhostText: true,
  maxRows: 5000,
  nullText: "null",
  gridFontSize: 12,
  zebraStripes: true,
  splitStatements: true,
  stopOnError: true,
  stripComments: false,
  keepHistory: true,
  historyLimit: 1000,
  connectTimeoutMs: 15000,
};

/** Rows a run may fetch: the Settings window and the toolbar both allow 1–100,000. */
export const MAX_ROWS_LIMIT = 100_000;

export function clampMaxRows(value: unknown, fallback = APP_SETTING_DEFAULTS.maxRows as number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_ROWS_LIMIT, Math.max(1, Math.floor(n)));
}
