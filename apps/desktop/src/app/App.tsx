import { useEffect, useRef, useState } from "react";
import { ExasolStudio } from "@/components/studio/ExasolStudio";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { SetupPacks, PENDING_PACK_KEY } from "@/features/onboarding/SetupPacks";
import { UpdateBanner } from "@/features/onboarding/UpdateBanner";
import { Tour, STUDIO_TOUR } from "@/features/onboarding/Tour";
import { ConnectRunWindow } from "@/features/connection/ConnectRunWindow";
import { VirtualSchemaWindow } from "@/features/connection/VirtualSchemaWindow";
import { useConnections } from "@/state/useConnections";
import { isConnectWindow, EV_ESTABLISHED } from "@/lib/connect-window";
import { isVsWindow } from "@/lib/vs-window";
import { isSettingsWindow } from "@/lib/settings-window";
import { SettingsWindow } from "@/features/settings/SettingsWindow";
import { isInstallWindow } from "@/lib/install-window";
import { InstallWindow } from "@/features/marketplace/InstallWindow";
import { LocalSetupFloating } from "@/features/marketplace/LocalSetupFloating";
import { isAiProvidersWindow } from "@/lib/ai-window";
import { AiProvidersWindow } from "@/features/assistant/AiProvidersWindow";
import { ipc, isTauri, type ConnectionProfile, type PersonalLocalStatus, type ServerInfo } from "@/lib/ipc";
import { VaultSetup, VaultUnlock } from "@/features/security/VaultScreens";

const ONBOARDED_KEY = "exasol-studio-onboarded";
const SETUP_KEY = "exasol-studio-setup-done";
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
  // A standalone per-item install window.
  if (isInstallWindow()) {
    return <InstallWindow />;
  }
  // The standalone AI provider setup window.
  if (isAiProvidersWindow()) {
    return <AiProvidersWindow />;
  }
  return <MainApp />;
}

function MainApp() {
  const { profiles, drivers, connections, active, refresh, disconnect, focus, adopt } =
    useConnections();
  const [onboarded, setOnboarded] = useState(
    () => window.localStorage.getItem(ONBOARDED_KEY) === "1",
  );
  const [setupDone, setSetupDone] = useState(
    () => window.localStorage.getItem(SETUP_KEY) === "1",
  );
  const [showTour, setShowTour] = useState(false);
  const [localStatus, setLocalStatus] = useState<PersonalLocalStatus | null>(null);
  const localConnectAttempt = useRef<string | null>(null);
  // Master-password vault gate (null = still loading its status).
  const [vault, setVault] = useState<{ configured: boolean; unlocked: boolean } | null>(null);
  const refreshVault = () =>
    ipc.vaultStatus().then((s) => setVault({ configured: s.configured, unlocked: s.unlocked })).catch(() => setVault({ configured: false, unlocked: true }));
  useEffect(() => {
    void refreshVault();
  }, []);

  // First value should not depend on a Marketplace window staying open. Once
  // the vault is available, resume the durable local database + Semantic Views
  // bootstrap in the native background and leave the main UI responsive.
  useEffect(() => {
    if (!isTauri() || !onboarded || !vault?.configured || !vault.unlocked) return;
    void ipc.personalLocalBootstrap().catch(() => undefined);
  }, [onboarded, vault?.configured, vault?.unlocked]);

  useEffect(() => {
    if (!isTauri()) return;
    void ipc.personalLocalStatus().then(setLocalStatus).catch(() => undefined);
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      unlisten = await listen<PersonalLocalStatus>("personal-local:status", (event) => setLocalStatus(event.payload));
    });
    return () => unlisten?.();
  }, []);

  // Match the out-of-box pgAdmin experience: open the managed connection as
  // soon as the database/profile are ready; Semantic Views may keep loading.
  useEffect(() => {
    const profileId = localStatus?.localReady ? localStatus.profileId : null;
    if (!profileId || localConnectAttempt.current === profileId || connections.some((c) => c.profile.id === profileId)) return;
    localConnectAttempt.current = profileId;
    void (async () => {
      const nextProfiles = await ipc.listConnectionProfiles();
      const profile = nextProfiles.find((candidate) => candidate.id === profileId);
      if (!profile) return;
      const server = await ipc.connect(profileId);
      adopt({ profile, server });
      await refresh();
    })().catch(() => {
      localConnectAttempt.current = null;
    });
  }, [localStatus, connections, adopt, refresh]);

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

  // Vault gate. A returning user with a configured-but-locked vault unlocks
  // first; a first-run user sets a master password right after Get Started.
  if (vault === null) {
    return <div className="flex h-screen items-center justify-center bg-background" />;
  }
  if (vault.configured && !vault.unlocked) {
    return <VaultUnlock onUnlocked={refreshVault} />;
  }

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

  if (!vault.configured) {
    return <VaultSetup onDone={refreshVault} />;
  }

  if (!setupDone) {
    return (
      <SetupPacks
        onDone={(packItemIds) => {
          // The complete local data/AI stack is handled by the durable native
          // bootstrap; setup packs only queue genuinely optional additions.
          const core = new Set(["exasol-personal", "pyexasol", "exapump", "mcp-server", "agent-skills"]);
          const optionalItems = packItemIds?.filter((id) => !core.has(id));
          if (optionalItems?.length) {
            window.localStorage.setItem(PENDING_PACK_KEY, JSON.stringify(optionalItems));
          }
          window.localStorage.setItem(SETUP_KEY, "1");
          setSetupDone(true);
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
      <UpdateBanner />
      <LocalSetupFloating />
    </>
  );
}
