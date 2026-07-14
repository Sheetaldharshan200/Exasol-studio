import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { isTauri } from "@/lib/ipc";

type Update = { version: string; downloadAndInstall: (cb?: (e: unknown) => void) => Promise<void> };

/** Checks the GitHub release for a newer signed build and offers a one-click
 *  update (download + relaunch). Silent when up to date or in the browser. */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = (await check()) as unknown as Update | null;
        if (u && u.version) {
          updateRef.current = u;
          setVersion(u.version);
        }
      } catch {
        /* no updater endpoint / offline / dev — ignore */
      }
    })();
  }, []);

  if (!version || dismissed) return null;

  async function install() {
    if (!updateRef.current) return;
    setBusy(true);
    try {
      await updateRef.current.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl border border-primary/40 bg-popover px-4 py-2.5 text-[12.5px] text-foreground shadow-2xl">
      <Download className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1">
        Exasol Studio <span className="font-semibold">{version}</span> is available.
      </span>
      <button
        onClick={install}
        disabled={busy}
        className="flex h-6 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {busy ? "Updating…" : "Install & restart"}
      </button>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
