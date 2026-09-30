// The buttons around an active box, Panorama's way: they sit outside the box
// so they never cover data. Buttons that make a NEW box run down the right
// edge; buttons that act on the box run along the top; close sits on the
// corner. Missing capabilities are greyed out, not hidden.

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type HaloAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  side: "right" | "top";
  disabled?: boolean;
  /** A short mark drawn instead of the icon (e.g. `SQL`). */
  mark?: string;
  active?: boolean;
};

export function Halo({ actions, onClose, visible }: { actions: HaloAction[]; onClose: () => void; visible: boolean }) {
  const right = actions.filter((a) => a.side === "right");
  const top = actions.filter((a) => a.side === "top");
  const button = (a: HaloAction) => (
    <button
      key={a.id}
      type="button"
      title={a.label}
      aria-label={a.label}
      disabled={a.disabled}
      onClick={(e) => {
        e.stopPropagation();
        a.onClick();
      }}
      className={cn(
        "nodrag flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel px-1 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground",
        a.active && "border-primary bg-primary/10 text-primary",
      )}
    >
      {a.mark ? <span className="font-mono text-[9.5px] font-bold tracking-wide">{a.mark}</span> : <a.icon className="h-3.5 w-3.5" />}
    </button>
  );
  return (
    <div className={cn("pointer-events-none absolute inset-0 transition-opacity", visible ? "opacity-100" : "opacity-0")}>
      <div className="pointer-events-auto absolute -top-8 left-0 flex gap-1">{top.map(button)}</div>
      <div className="pointer-events-auto absolute -right-8 top-0 flex flex-col gap-1">{right.map(button)}</div>
      <button
        type="button"
        title="Close"
        aria-label="Close box"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="nodrag pointer-events-auto absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground shadow-sm hover:border-destructive hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
