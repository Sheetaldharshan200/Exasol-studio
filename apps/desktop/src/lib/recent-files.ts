// Recently opened or saved SQL files, newest first, remembered in this
// browser profile (a convenience: an empty list is fine).

const KEY = "studio.recentFiles";
export const RECENT_FILES_CAP = 10;

/** `path` moved to the front; duplicates (any separator, same path) dropped. */
export function pushRecent(list: readonly string[], path: string, cap = RECENT_FILES_CAP): string[] {
  if (!path.trim()) return [...list];
  return [path, ...list.filter((p) => p !== path)].slice(0, cap);
}

/** Whether a dropped file opens in a SQL tab. */
export const isSqlFile = (path: string) => /\.(sql|txt)$/i.test(path);

export function loadRecentFiles(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string").slice(0, RECENT_FILES_CAP) : [];
  } catch {
    return [];
  }
}

export function saveRecentFiles(list: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage off: the list just is not remembered */
  }
}
