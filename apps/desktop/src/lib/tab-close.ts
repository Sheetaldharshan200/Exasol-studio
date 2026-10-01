// Closing tabs without losing work. A tab opened from a file has unsaved
// changes when its SQL differs from what was last saved; an untitled tab when
// it holds SQL someone wrote (it has no file to fall back on at all).

import { tabHasWork, type SqlTab } from "../components/studio/tabs.ts";

export function hasUnsavedChanges(tab: SqlTab): boolean {
  if (tab.view !== "sql") return false;
  if (tab.filePath) return tab.sql !== (tab.savedSql ?? "");
  return tabHasWork(tab);
}

/** The question to ask before closing these tabs, or null when nothing would be lost. */
export function closeQuestion(closing: readonly SqlTab[]): string | null {
  const dirty = closing.filter(hasUnsavedChanges);
  if (!dirty.length) return null;
  if (dirty.length === 1) return `"${dirty[0].title}" has unsaved changes. Close it and discard them?`;
  const names = dirty.slice(0, 5).map((t) => `"${t.title}"`).join(", ");
  const more = dirty.length > 5 ? ` and ${dirty.length - 5} more` : "";
  return `${dirty.length} tabs have unsaved changes: ${names}${more}. Close them and discard the changes?`;
}
