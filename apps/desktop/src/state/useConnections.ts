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
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
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
