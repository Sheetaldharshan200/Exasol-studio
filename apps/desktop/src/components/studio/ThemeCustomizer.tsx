import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw, X } from "lucide-react";
import { applyThemePreset, RADIUS_OPTIONS, storedPresetId, storedRadius, THEME_PRESETS } from "@/lib/theme-presets";
import { cn } from "@/lib/utils";

/**
 * tweakcn-style theme customizer: a palette button that opens a popover with
 * color presets (two-dot swatches) and a radius picker. Works standalone in
 * the titlebar and embedded (list only) in Settings.
 */
export function ThemeCustomizer({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Customize theme"
        title="Customize theme"
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground",
          open && "bg-secondary text-foreground",
        )}
      >
        <Palette className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <ThemePresetPicker onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** The picker body — also embedded directly in Settings. */
export function ThemePresetPicker({ onClose }: { onClose?: () => void }) {
  const [presetId, setPresetId] = useState(storedPresetId);
  const [radius, setRadius] = useState(storedRadius);

  function pick(id: string) {
    setPresetId(id);
    applyThemePreset(id, radius);
  }
  function pickRadius(r: string) {
    setRadius(r);
    applyThemePreset(presetId, r);
  }
  function reset() {
    setPresetId("default");
    setRadius("0.5rem");
    applyThemePreset("default", "0.5rem");
  }

  return (
    <div className="flex max-h-[420px] flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
        <Palette className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-semibold text-foreground">Customize</span>
        <span className="ml-auto flex items-center gap-0.5">
          <button onClick={reset} title="Reset to default" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
            <RotateCcw className="h-3 w-3" />
          </button>
          {onClose ? (
            <button onClick={onClose} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              presetId === p.id ? "bg-secondary text-foreground" : "text-foreground/85 hover:bg-secondary/60",
            )}
          >
            <span className="flex shrink-0 -space-x-1.5">
              <span className="h-4 w-4 rounded-full border border-background" style={{ background: p.dots[0] }} />
              <span className="h-4 w-4 rounded-full border border-background" style={{ background: p.dots[1] }} />
            </span>
            <span className="flex-1 truncate">{p.name}</span>
            {presetId === p.id ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Radius</span>
        <span className="ml-auto flex items-center gap-1.5">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => pickRadius(r)}
              title={r}
              aria-label={`Corner radius ${r}`}
              className={cn(
                "h-5 w-5 border-2 bg-transparent transition-colors",
                radius === r ? "border-primary" : "border-muted-foreground/40 hover:border-foreground/60",
              )}
              style={{ borderRadius: r === "1rem" ? "10px" : r === "0.75rem" ? "8px" : r === "0.5rem" ? "6px" : r === "0.25rem" ? "3px" : "0" }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
