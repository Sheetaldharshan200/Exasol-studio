import { useEffect, useState } from "react";
import { ExasolStudio } from "@/components/studio/ExasolStudio";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { Tour, STUDIO_TOUR } from "@/features/onboarding/Tour";
import { ConnectRunWindow } from "@/features/connection/ConnectRunWindow";
import { VirtualSchemaWindow } from "@/features/connection/VirtualSchemaWindow";
import { useConnections } from "@/state/useConnections";
import { isConnectWindow, EV_ESTABLISHED } from "@/lib/connect-window";
import { isVsWindow } from "@/lib/vs-window";
import { isSettingsWindow } from "@/lib/settings-window";
import { SettingsWindow } from "@/features/settings/SettingsWindow";
import { isTauri, type ConnectionProfile, type ServerInfo } from "@/lib/ipc";

const ONBOARDED_KEY = "exasol-studio-onboarded";
const TOURED_KEY = "exasol-studio-toured";

export function App() {
  // The dedicated native connect window renders only the run flow.
  if (isConnectWindow()) {
    return <ConnectRunWindow />;
  }
  // The dedicated native virtual-schema window renders only that wizard.
  if (isVsWindow()) {
    return <VirtualSchemaWindow />;
  }
  // The standalone Settings window.
  if (isSettingsWindow()) {
    return <SettingsWindow />;
  }
  return <MainApp />;
}

function MainApp() {
  const { profiles, drivers, connections, active, refresh, disconnect, focus, adopt } =
    useConnections();
  const [onboarded, setOnboarded] = useState(
    () => window.localStorage.getItem(ONBOARDED_KEY) === "1",
  );
  const [showTour, setShowTour] = useState(false);

  // Kick off the guided tour once, shortly after the studio first mounts.
  useEffect(() => {
    if (!onboarded) return;
    if (window.localStorage.getItem(TOURED_KEY) === "1") return;
    const t = setTimeout(() => setShowTour(true), 600);
    return () => clearTimeout(t);
  }, [onboarded]);

  const endTour = () => {
    window.localStorage.setItem(TOURED_KEY, "1");
    setShowTour(false);
  };

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
    <>
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
      {showTour ? <Tour steps={STUDIO_TOUR} onClose={endTour} /> : null}
    </>
  );
}
