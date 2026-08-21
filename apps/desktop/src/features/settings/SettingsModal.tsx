import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { OPEN_SETTINGS_MODAL } from "@/lib/settings-window";
import { SettingsWindow } from "./SettingsWindow";

/**
 * The web build's Settings surface: an in-app modal (a browser tab can't open
 * a native window). Opens on the OPEN_SETTINGS_MODAL event dispatched by
 * openSettingsWindow, sized like the desktop settings window with an expand
 * toggle to go full-screen. Never opens in Tauri — there the native window is
 * used instead.
 */
export function SettingsModalHost() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      setCategory((e as CustomEvent<{ category?: string }>).detail?.category);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_MODAL, on);
    return () => window.removeEventListener(OPEN_SETTINGS_MODAL, on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50" onMouseDown={() => setOpen(false)}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "overflow-hidden rounded-xl border border-border shadow-2xl transition-[width,height]",
          expanded ? "h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)]" : "h-[min(680px,85vh)] w-[min(1000px,92vw)]",
        )}
      >
        <SettingsWindow
          embedded={{
            onClose: () => setOpen(false),
            category,
            expanded,
            onToggleExpand: () => setExpanded((v) => !v),
          }}
        />
      </div>
    </div>
  );
}
