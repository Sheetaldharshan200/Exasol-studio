import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { hexToHsv, hsvToHex, type Hsv } from "@/lib/color";

const PRESETS = ["#82dd4b", "#4fb58a", "#e9a94f", "#5fd0c0", "#6db3f2", "#2563eb", "#b07cf0", "#e0679b", "#d8605a", "#e3c75f", "#9d9da6", "#ededee"];

/**
 * Visual color picker: a swatch button opening a popover with a
 * saturation/value square, a hue slider, quick presets, and the current hex.
 * Self-contained (no popover lib): outside-click and Escape close it.
 * Works everywhere the webview lacks a native <input type="color"> picker.
 */
export function ColorPicker({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 100, s: 0.6, v: 0.8 });
  const rootRef = useRef<HTMLDivElement>(null);

  // Follow external value changes (hex field edits, resets) while open.
  useEffect(() => {
    const parsed = hexToHsv(value);
    if (parsed && hsvToHex(hsv.h, hsv.s, hsv.v) !== hsvToHex(parsed.h, parsed.s, parsed.v)) setHsv(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next: Hsv) {
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  }

  // Shared drag-tracking for the SV square and the hue bar.
  function track(e: React.PointerEvent<HTMLDivElement>, apply: (x: number, y: number) => void) {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      apply(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    move(e.nativeEvent);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  const current = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor = hsvToHex(hsv.h, 1, 1);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label ?? "Pick a color"}
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-border shadow-inner transition-transform hover:scale-105"
        style={{ background: value }}
      />
      {open ? (
        <div className="absolute left-0 top-8 z-50 w-56 rounded-lg border border-border bg-panel p-3 shadow-xl">
          {/* Saturation / value square */}
          <div
            onPointerDown={(e) => track(e, (x, y) => commit({ ...hsv, s: x, v: 1 - y }))}
            className="relative h-32 w-full cursor-crosshair touch-none rounded-md"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
            }}
          >
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }}
            />
          </div>
          {/* Hue slider */}
          <div
            onPointerDown={(e) => track(e, (x) => commit({ ...hsv, h: x * 360 }))}
            className="relative mt-3 h-3 w-full cursor-pointer touch-none rounded-full"
            style={{
              background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
            />
          </div>
          {/* Presets */}
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={p}
                onClick={() => {
                  const parsed = hexToHsv(p);
                  if (parsed) commit(parsed);
                }}
                className={cn(
                  "h-6 w-full rounded border transition-transform hover:scale-110",
                  p.toLowerCase() === value.toLowerCase() ? "border-primary ring-1 ring-primary/50" : "border-border",
                )}
                style={{ background: p }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted-foreground">{current}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
