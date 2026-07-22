import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw, X } from "lucide-react";
import { applyTheme, contrastFg, MONO_FONTS, RADIUS_OPTIONS, SANS_FONTS, storedTheme, THEME_PRESETS, type ThemeCustom } from "@/lib/theme-presets";
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
  const [custom, setCustom] = useState<ThemeCustom>(storedTheme);

  function set(patch: Partial<ThemeCustom>) {
    setCustom((c) => {
      const next = { ...c, ...patch };
      applyTheme(next);
      return next;
    });
  }
  const reset = () => set({ presetId: "default", radius: "0.5rem", primary: undefined, sansId: undefined, monoId: undefined });
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(custom.primary ?? "");

  return (
    <div className="flex max-h-[480px] flex-col">
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
            onClick={() => set({ presetId: p.id })}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              custom.presetId === p.id ? "bg-secondary text-foreground" : "text-foreground/85 hover:bg-secondary/60",
            )}
          >
            <span className="flex shrink-0 -space-x-1.5">
              <span className="h-4 w-4 rounded-full border border-background" style={{ background: p.dots[0] }} />
              <span className="h-4 w-4 rounded-full border border-background" style={{ background: p.dots[1] }} />
            </span>
            <span className="flex-1 truncate">{p.name}</span>
            {custom.presetId === p.id ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </button>
        ))}

        {/* Buttons & accent — full color-picker + hex, independent of the preset. */}
        <div className="mt-1.5 border-t border-border/60 px-2 pb-1 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Buttons &amp; accent</div>
          <div className="flex items-center gap-1.5">
            <label className="relative h-6 w-8 cursor-pointer overflow-hidden rounded-md border border-border" title="Pick a color">
              <span className="absolute inset-0" style={{ background: custom.primary ?? "var(--primary)" }} />
              <input
                type="color"
                value={hexOk ? custom.primary! : "#4fa823"}
                onChange={(e) => set({ primary: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              value={custom.primary ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") set({ primary: undefined });
                else if (/^#[0-9a-fA-F]{6}$/.test(v)) set({ primary: v });
                else setCustom((c) => ({ ...c, primary: v })); // typing in progress
              }}
              placeholder="preset color (hex, e.g. #4fa823)"
              spellCheck={false}
              className="h-6 min-w-0 flex-1 rounded-md border border-border bg-editor px-2 font-mono text-[10.5px] outline-none focus:border-primary/50"
            />
            {custom.primary ? (
              <button onClick={() => set({ primary: undefined })} title="Use the preset's color" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          {hexOk ? (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="rounded px-1.5 py-px font-medium" style={{ background: custom.primary, color: contrastFg(custom.primary!) }}>Button</span>
              text auto-adjusts for contrast
            </div>
          ) : null}
        </div>

        {/* Fonts — bundled, all SIL-OFL (free for commercial use). */}
        <div className="border-t border-border/60 px-2 pb-1 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fonts (open licensed)</div>
          <div className="flex flex-col gap-1.5">
            <select
              value={custom.sansId ?? "inter"}
              onChange={(e) => set({ sansId: e.target.value })}
              className="h-6 w-full rounded-md border border-border bg-editor px-1.5 text-[11px] outline-none"
              title="Interface font"
            >
              {SANS_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              value={custom.monoId ?? "jetbrains"}
              onChange={(e) => set({ monoId: e.target.value })}
              className="h-6 w-full rounded-md border border-border bg-editor px-1.5 text-[11px] outline-none"
              title="Code font"
            >
              {MONO_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Radius</span>
        <span className="ml-auto flex items-center gap-1.5">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => set({ radius: r })}
              title={r}
              aria-label={`Corner radius ${r}`}
              className={cn(
                "h-5 w-5 border-2 bg-transparent transition-colors",
                custom.radius === r ? "border-primary" : "border-muted-foreground/40 hover:border-foreground/60",
              )}
              style={{ borderRadius: r === "1rem" ? "10px" : r === "0.75rem" ? "8px" : r === "0.5rem" ? "6px" : r === "0.25rem" ? "3px" : "0" }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
