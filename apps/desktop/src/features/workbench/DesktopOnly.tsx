import { Monitor } from "lucide-react";
import { ipc } from "@/lib/ipc";

/**
 * The web build's honest answer for features that need the machine — a real
 * page saying so, never a broken surface. Used for anything whose IPCs are
 * desktop-only (git, BucketFS, local backups, …).
 */
export function DesktopOnly({ feature, detail }: { feature: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-editor px-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-primary">
        <Monitor className="h-6 w-6" />
      </span>
      <h2 className="font-heading text-[15px] font-bold text-foreground">{feature} lives in the desktop app</h2>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
      <button
        onClick={() =>
          void ipc
            .openExternal("https://github.com/Sheetaldharshan200/Exasol-studio/releases/latest")
            .catch(() => window.open("https://github.com/Sheetaldharshan200/Exasol-studio/releases/latest", "_blank"))
        }
        className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85"
      >
        Get the desktop app
      </button>
    </div>
  );
}
