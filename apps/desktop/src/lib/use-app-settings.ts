// The app settings for components outside the shell (notebooks, …): read once
// and kept current when the Settings window saves.

import { useEffect, useState } from "react";
import { ipc, isTauri } from "@/lib/ipc";

export function useAppSettings(): Record<string, unknown> {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    ipc.getAppSettings().then((s) => alive && setSettings(s)).catch(() => undefined);
    if (isTauri()) {
      void import("@tauri-apps/api/event")
        .then(({ listen }) => listen<Record<string, unknown>>("settings:changed", (e) => alive && setSettings(e.payload)))
        .then((u) => {
          if (alive) unlisten = u;
          else u();
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return settings;
}
