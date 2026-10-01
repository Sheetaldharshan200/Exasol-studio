// The active connection's Properties settings, kept current when they are
// applied ("studio:conn-settings-changed"). Null with no connection.

import { useEffect, useState } from "react";
import { ipc } from "@/lib/ipc";
import { withConnDefaults, type ConnSettings } from "@/lib/conn-settings";

export function useConnSettings(profileId: string | null | undefined): ConnSettings | null {
  const [settings, setSettings] = useState<ConnSettings | null>(null);
  useEffect(() => {
    if (!profileId || profileId === "none") {
      setSettings(null);
      return;
    }
    let dead = false;
    const load = () =>
      void ipc
        .connectionSettingsGet(profileId)
        .then((raw) => !dead && setSettings(withConnDefaults(raw)))
        .catch(() => !dead && setSettings(withConnDefaults(null)));
    load();
    window.addEventListener("studio:conn-settings-changed", load);
    return () => {
      dead = true;
      window.removeEventListener("studio:conn-settings-changed", load);
    };
  }, [profileId]);
  return settings;
}
