// The keyboard shortcuts, in one table: what the shell's key handler matches
// and what the shortcut sheet shows. "Mod" is ⌘ on macOS and Ctrl elsewhere.
// Shortcuts the SQL editor owns (Monaco) are listed for the sheet but matched
// there, not here.

export type Shortcut = {
  id: string;
  keys: string;
  label: string;
  group: "Run" | "Tabs" | "Files" | "Focus" | "Editor" | "Find";
  /** Handled by the SQL editor itself (shown in the sheet only). */
  editor?: boolean;
  /** Not taken while typing in the SQL editor (Monaco owns the chord). */
  notInEditor?: boolean;
  /** Still taken while a dialog is open. */
  inDialog?: boolean;
  /** Repeats while the key is held. */
  repeats?: boolean;
};

export const SHORTCUTS: Shortcut[] = [
  { id: "run.script", keys: "Mod+Enter", label: "Run the script", group: "Run", editor: true },
  { id: "run.current", keys: "Mod+.", label: "Run the statement at the cursor", group: "Run", editor: true },
  { id: "run.buffer", keys: "Mod+Shift+Enter", label: "Run the whole buffer as one statement", group: "Run", editor: true },
  { id: "run.explain", keys: "Mod+Alt+Enter", label: "Explain plan", group: "Run", editor: true },
  { id: "run.cancel", keys: "Mod+Shift+.", label: "Stop the running query", group: "Run", inDialog: true },
  { id: "tab.new", keys: "Mod+T", label: "New SQL tab", group: "Tabs" },
  { id: "tab.close", keys: "Mod+W", label: "Close the tab", group: "Tabs" },
  { id: "tab.next", keys: "Ctrl+Tab", label: "Next tab", group: "Tabs", repeats: true },
  { id: "tab.prev", keys: "Ctrl+Shift+Tab", label: "Previous tab", group: "Tabs", repeats: true },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `tab.${i + 1}`, keys: `Mod+${i + 1}`, label: `Tab ${i + 1}`, group: "Tabs" as const })),
  { id: "file.save", keys: "Mod+S", label: "Save the tab's SQL", group: "Files" },
  { id: "file.saveAs", keys: "Mod+Shift+S", label: "Save as…", group: "Files" },
  { id: "file.open", keys: "Mod+O", label: "Open a SQL file", group: "Files" },
  { id: "focus.tree", keys: "Mod+Alt+1", label: "Focus the navigator", group: "Focus" },
  { id: "focus.editor", keys: "Mod+Alt+2", label: "Focus the editor", group: "Focus" },
  { id: "focus.results", keys: "Mod+Alt+3", label: "Focus the results", group: "Focus" },
  { id: "find.everything", keys: "Mod+K", label: "Search everything", group: "Find", notInEditor: true },
  { id: "find.quick", keys: "Mod+P", label: "Quick open (in the editor)", group: "Find", editor: true },
  { id: "editor.format", keys: "Shift+Alt+F", label: "Format SQL", group: "Editor", editor: true },
  { id: "editor.quickFix", keys: "Alt+Enter", label: "Quick fix", group: "Editor", editor: true },
  { id: "editor.comment", keys: "Mod+/", label: "Comment / uncomment lines", group: "Editor", editor: true },
  { id: "help.shortcuts", keys: "Mod+Shift+/", label: "This list of shortcuts", group: "Find" },
];

type KeyLike = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; repeat?: boolean; altGraph?: boolean };

/** The main key of a combination as `KeyboardEvent.code` sees it (layout-
 *  independent for letters and digits). */
function codeOf(main: string): string {
  if (/^[A-Z]$/.test(main)) return `Key${main}`;
  if (/^[0-9]$/.test(main)) return `Digit${main}`;
  return { ".": "Period", "/": "Slash", Enter: "Enter", Tab: "Tab", Escape: "Escape" }[main] ?? main;
}

/** Whether a key event is this combination. */
export function matchesKeys(e: KeyLike, keys: string, mac: boolean): boolean {
  const parts = keys.split("+");
  const main = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const wantMeta = mods.has("Mod") ? mac : false;
  const wantCtrl = mods.has("Ctrl") || (mods.has("Mod") && !mac);
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl) return false;
  if (e.shiftKey !== mods.has("Shift") || e.altKey !== mods.has("Alt")) return false;
  if (e.code) return e.code === codeOf(main);
  return e.key.toUpperCase() === main.toUpperCase();
}

/** The shell's shortcut for a key event, or null. AltGr (Ctrl+Alt on
 *  Windows/Linux) types characters, so it is never a shortcut. */
export function matchShortcut(e: KeyLike, mac: boolean, where: { inEditor: boolean; inDialog: boolean }): Shortcut | null {
  if (e.altGraph) return null;
  return (
    SHORTCUTS.find(
      (s) =>
        !s.editor &&
        !(where.inEditor && s.notInEditor) &&
        !(where.inDialog && !s.inDialog) &&
        !(e.repeat && !s.repeats) &&
        matchesKeys(e, s.keys, mac),
    ) ?? null
  );
}

/** A combination as people read it on this platform. */
export function formatKeys(keys: string, mac: boolean): string {
  const sym: Record<string, string> = mac
    ? { Mod: "⌘", Ctrl: "⌃", Shift: "⇧", Alt: "⌥", Enter: "↩", Tab: "⇥" }
    : { Mod: "Ctrl", Ctrl: "Ctrl", Shift: "Shift", Alt: "Alt", Enter: "Enter", Tab: "Tab" };
  const parts = keys.split("+").map((p) => sym[p] ?? p);
  return mac ? parts.join("") : parts.join("+");
}
