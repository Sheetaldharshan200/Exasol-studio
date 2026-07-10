import { useEffect, useState } from "react";
import { ExasolStudio } from "@/components/studio/ExasolStudio";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { ConnectRunWindow } from "@/features/connection/ConnectRunWindow";
import { useConnections } from "@/state/useConnections";
import { isConnectWindow, EV_ESTABLISHED } from "@/lib/connect-window";
import { isTauri, type ConnectionProfile, type ServerInfo } from "@/lib/ipc";

const ONBOARDED_KEY = "exasol-studio-onboarded";

export function App() {
  // The dedicated native connect window renders only the run flow.
  if (isConnectWindow()) {
    return <ConnectRunWindow />;
  }
  return <MainApp />;
}

function MainApp() {
  const { profiles, drivers, connections, active, refresh, disconnect, focus, adopt } =
    useConnections();
  const [onboarded, setOnboarded] = useState(
    () => window.localStorage.getItem(ONBOARDED_KEY) === "1",
  );

  // When the separate connect window succeeds, it emits the result here.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ profile: ConnectionProfile; server: ServerInfo }>(
        EV_ESTABLISHED,
        (e) => {
          adopt({ profile: e.payload.profile, server: e.payload.server });
          void refresh();
        },
      );
    })();
    return () => unlisten?.();
  }, [refresh, adopt]);

  if (!onboarded) {
    return (
      <Onboarding
        onGetStarted={() => {
          window.localStorage.setItem(ONBOARDED_KEY, "1");
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <ExasolStudio
      connection={active}
      connections={connections}
      drivers={drivers}
      profiles={profiles}
      onConnected={(profile, server) => adopt({ profile, server })}
      onFocusConnection={focus}
      onDisconnect={disconnect}
      onSaved={refresh}
    />
  );
}
