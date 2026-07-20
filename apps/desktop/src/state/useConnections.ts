import { useCallback, useEffect, useMemo, useState } from "react";
import { ipc, type ConnectionProfile, type ServerInfo } from "@/lib/ipc";

export type ActiveConnection = {
  profile: ConnectionProfile;
  server: ServerInfo;
};

/**
 * Holds every open connection at once (multi-connection, DataGrip-style) plus
 * which one currently has focus. `active` is the focused connection; the query
 * workspace and navigator follow it.
 */
export function useConnections() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [drivers, setDrivers] = useState<Awaited<ReturnType<typeof ipc.listDrivers>>>([]);
  const [connections, setConnections] = useState<ActiveConnection[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const active = useMemo(
    () => connections.find((c) => c.profile.id === activeProfileId) ?? null,
    [connections, activeProfileId],
  );

  const refresh = useCallback(async () => {
    const [nextProfiles, nextDrivers] = await Promise.all([
      ipc.listConnectionProfiles(),
      ipc.listDrivers(),
    ]);
    setProfiles(nextProfiles);
    setDrivers(nextDrivers);
    // Reconcile the open connections with the profiles that still exist.
    // Deleting a profile (Clear / Remove on the Connect tab) closes its backend
    // pool, so a lingering ActiveConnection would fail every later call with
    // "connection … is not open". Drop any whose profile was removed, and move
    // focus off it if it was the active one.
    const validIds = new Set(nextProfiles.map((p) => p.id));
    setConnections((list) => {
      const kept = list.filter((c) => validIds.has(c.profile.id));
      if (kept.length !== list.length) {
        setActiveProfileId((prev) =>
          prev && validIds.has(prev) ? prev : (kept.at(-1)?.profile.id ?? null),
        );
      }
      return kept;
    });
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      // Re-adopt connections that are still open in the backend (their pools
      // survive a webview reload) so a reload never appears to disconnect.
      try {
        const [openIds, profs] = await Promise.all([
          ipc.listOpenConnections(),
          ipc.listConnectionProfiles(),
        ]);
        for (const id of openIds) {
          const profile = profs.find((p) => p.id === id);
          if (!profile) continue;
          try {
            const server = await ipc.connect(id); // idempotent: reuses the open pool
            setConnections((list) => [...list.filter((c) => c.profile.id !== id), { profile, server }]);
            setActiveProfileId((prev) => prev ?? id);
          } catch {
            /* pool gone — skip */
          }
        }
      } catch {
        /* backend didn't report open connections */
      }
    })().finally(() => setLoading(false));
  }, [refresh]);

  /** Record an already-established connection (e.g. from the native window). */
  const adopt = useCallback((conn: ActiveConnection) => {
    setConnections((list) => [...list.filter((c) => c.profile.id !== conn.profile.id), conn]);
    setActiveProfileId(conn.profile.id);
  }, []);

  const connect = useCallback(
    async (profile: ConnectionProfile) => {
      const server = await ipc.connect(profile.id);
      await refresh();
      adopt({ profile, server });
      return server;
    },
    [refresh, adopt],
  );

  const disconnect = useCallback(
    async (profileId?: string) => {
      const id = profileId ?? activeProfileId;
      if (!id) return;
      await ipc.disconnect(id).catch(() => undefined);
      const remaining = connections.filter((c) => c.profile.id !== id);
      setConnections(remaining);
      setActiveProfileId((prev) =>
        prev === id ? (remaining.at(-1)?.profile.id ?? null) : prev,
      );
    },
    [activeProfileId, connections],
  );

  const focus = useCallback((profileId: string) => setActiveProfileId(profileId), []);

  return {
    profiles,
    drivers,
    connections,
    active,
    activeProfileId,
    loading,
    refresh,
    connect,
    disconnect,
    focus,
    adopt,
  };
}
