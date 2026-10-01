// The app settings for components outside the shell (notebooks, …): read once
// and kept current when the Settings window saves.

import { useEffect, useState } from "react";
import { ipc, isTauri } from "@/lib/ipc";

export function useAppSettings(): Record<string, unknown> {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let alive = true;
    // A save event is newer than any read still in flight: the read must not
    // overwrite it.
    let gotEvent = false;
    let unlisten: (() => void) | undefined;
    const read = () =>
      ipc
        .getAppSettings()
        .then((s) => alive && !gotEvent && setSettings(s))
        .catch(() => undefined);
    if (!isTauri()) {
      void read();
    } else {
      // Subscribe first, then read, so a save in between is not missed.
      void import("@tauri-apps/api/event")
        .then(({ listen }) =>
          listen<Record<string, unknown>>("settings:changed", (e) => {
            gotEvent = true;
            if (alive) setSettings(e.payload);
          }),
        )
        .then((u) => {
          if (alive) unlisten = u;
          else u();
        })
        .catch(() => undefined)
        .finally(() => void read());
    }
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return settings;
}
