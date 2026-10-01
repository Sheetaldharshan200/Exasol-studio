// The active connection's Properties settings, kept current when they are
// applied ("studio:conn-settings-changed"). Null with no connection.

import { useEffect, useState } from "react";
import { ipc } from "@/lib/ipc";
import { withConnDefaults, type ConnSettings } from "@/lib/conn-settings";

export function useConnSettings(profileId: string | null | undefined): ConnSettings | null {
  // Keyed by profile: right after a switch, the previous connection's
  // settings are never shown as this one's.
  const [entry, setEntry] = useState<{ id: string; settings: ConnSettings } | null>(null);
  useEffect(() => {
    if (!profileId || profileId === "none") {
      setEntry(null);
      return;
    }
    let dead = false;
    const load = () =>
      void ipc
        .connectionSettingsGet(profileId)
        .then((raw) => !dead && setEntry({ id: profileId, settings: withConnDefaults(raw) }))
        .catch(() => !dead && setEntry({ id: profileId, settings: withConnDefaults(null) }));
    load();
    window.addEventListener("studio:conn-settings-changed", load);
    return () => {
      dead = true;
      window.removeEventListener("studio:conn-settings-changed", load);
    };
  }, [profileId]);
  return entry && entry.id === profileId ? entry.settings : null;
}
