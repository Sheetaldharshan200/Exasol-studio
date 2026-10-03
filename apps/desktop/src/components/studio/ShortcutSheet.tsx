// Every keyboard shortcut, grouped (Mod+Shift+/ or the Help menu).

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS, formatKeys, type Shortcut } from "@/lib/shortcuts";
import { isMac } from "./use-shortcuts";

const GROUPS: Shortcut["group"][] = ["Run", "Editor", "Tabs", "Files", "Focus", "Find"];

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mac = isMac();
  // Tabs 1–9 read as one line.
  const shown = SHORTCUTS.filter((s) => !/^tab\.[2-9]$/.test(s.id)).map((s) => (s.id === "tab.1" ? { ...s, keys: "Mod+1", label: "Tab 1 to 9 (Mod+1 … Mod+9)" } : s));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-x-8 gap-y-4 overflow-y-auto sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3 className="eyebrow-muted mb-1.5">{g}</h3>
              <ul className="space-y-1">
                {shown
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="text-foreground">{s.label}</span>
                      <kbd className="shrink-0 rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{formatKeys(s.keys, mac)}</kbd>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
