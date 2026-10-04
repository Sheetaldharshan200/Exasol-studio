// The shell's keyboard shortcuts (lib/shortcuts.ts): one window listener,
// dispatching to the actions the shell provides. Keys the SQL editor owns
// never reach here (Monaco stops them), and Mod+K is left to Monaco's
// chords while the editor has focus. While a dialog is open only Stop works.

import { useEffect, useRef } from "react";
import { matchShortcut } from "@/lib/shortcuts";

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function useShortcuts(actions: Partial<Record<string, () => void>>) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      const s = matchShortcut({ key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, altGraph: e.getModifierState?.("AltGraph") }, isMac(), {
        inEditor: !!target?.closest?.(".monaco-editor"),
        // A dialog's own keys stay its own (Mod+W in a search box closes no tab).
        inDialog: !!document.querySelector('[role="dialog"], [role="alertdialog"]'),
      });
      if (!s) return;
      const run = latest.current[s.id];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
