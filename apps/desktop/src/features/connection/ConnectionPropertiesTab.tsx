import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plug,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Type,
  Unplug,
} from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { errorMessage, ipc, isTauri, type ConnectionProfile, type DriverInfo, type NetworkSettings, type ServerInfo } from "@/lib/ipc";
import type { ActiveConnection } from "@/state/useConnections";
import { cn } from "@/lib/utils";
import { connectionUrl } from "@/lib/connection-url";
import { AUTH_METHODS } from "@/lib/connect-flow";
import { AddressNote, ConnectionTrustFields, SignInMethodRow, type TrustDraft } from "@/features/connection/ConnectionTrustFields";
import { ConnectionNetworkFields } from "@/features/connection/ConnectionNetworkFields";
import { checkHost, checkPort, parseDsn } from "@/lib/dsn";
import { DEFAULT_CONN_SETTINGS, ENVIRONMENTS, withConnDefaults, type ConnSettings, type Environment } from "@/lib/conn-settings";
export { DEFAULT_CONN_SETTINGS, type ConnSettings };
import { DatabaseInfoPanel } from "@/features/workbench/DatabaseInfoPanel";
import { DataTypesPanel } from "@/features/workbench/DataTypesPanel";
import { ObjectSearch } from "@/features/workbench/ObjectSearch";
import { DriversSection, DRIVER_ICON, type DriverReadiness } from "@/features/connection/DriversSection";
import { EV_TRUSTED, openConnectWindow, type TrustedCertificate } from "@/lib/connect-window";
import { agent as agentClient } from "@/lib/agent-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function loadConnSettings(profileId: string): Promise<ConnSettings> {
  const raw = await ipc.connectionSettingsGet(profileId).catch(() => null);
  return withConnDefaults(raw);
}

export const ACCENT_PRESETS = ["#e11d48", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#6366f1", "#a855f7", "#64748b"];


/* ── shared building blocks (info-page design language) ─────────────────── */

function SectionCard({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-panel/50 p-4">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <div className="mt-1 mb-3 h-px bg-border/70" />
      {description ? <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{description}</p> : null}
      <div>{children}</div>
    </div>
  );
}

function CheckBox({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-40",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/40 hover:border-muted-foreground",
      )}
    >
      {checked ? <Check className="h-3 w-3" /> : null}
    </button>
  );
}

function CheckRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0" title={hint}>
      <span className="w-56 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <CheckBox checked={checked} onChange={onChange} />
    </div>
  );
}

function RadioRow<T extends string>({ label, options, value, onChange }: {
  label?: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-2 last:border-0">
      {label !== undefined ? <span className="w-56 shrink-0 pt-0.5 text-[12px] text-muted-foreground">{label}</span> : null}
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <button key={o.value} onClick={() => onChange(o.value)} title={o.hint} className="flex items-center gap-2 text-left">
            <span
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                o.value === value ? "border-primary" : "border-border",
              )}
            >
              {o.value === value ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
            </span>
            <span className={cn("text-[12.5px]", o.value === value ? "text-foreground" : "text-muted-foreground")}>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InputRow({ label, value, onChange, type = "text", mono = true, width = "w-full", placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  width?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-56 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 rounded-md border border-border bg-secondary/30 px-2.5 text-[12.5px] text-foreground outline-none focus:border-primary/60",
          mono && "font-mono",
          width,
        )}
      />
    </div>
  );
}

/* ── Properties categories ──────────────────────────────────────────────── */

type CategoryId =
  | "dbProfile" | "driverProps"
  | "authentication" | "physical" | "transaction" | "hooks" | "color" | "sqlEditor" | "safety";

const CATEGORIES: { id: CategoryId; label: string; group: "root" | "exasol" }[] = [
  { id: "dbProfile", label: "Database Profile", group: "root" },
  { id: "driverProps", label: "Driver Properties", group: "root" },
  { id: "safety", label: "Environment and Safety", group: "exasol" },
  { id: "authentication", label: "Authentication", group: "exasol" },
  { id: "physical", label: "Physical Connection", group: "exasol" },
  { id: "transaction", label: "Transaction", group: "exasol" },
  { id: "hooks", label: "Connection Hooks", group: "exasol" },
  { id: "color", label: "Color and Border", group: "exasol" },
  { id: "sqlEditor", label: "SQL Editor", group: "exasol" },
];

/** Defaults for one category only (the "Defaults…" button). */
function categoryDefaults(s: ConnSettings, cat: CategoryId): ConnSettings {
  const d = structuredClone(DEFAULT_CONN_SETTINGS);
  const next = structuredClone(s);
  switch (cat) {
    case "authentication": next.auth = d.auth; break;
    case "driverProps": next.driver = d.driver; break;
    case "physical": next.physical = d.physical; break;
    case "transaction": next.transaction = d.transaction; break;
    case "hooks": next.hooks = d.hooks; break;
    case "color": next.color = d.color; break;
    case "sqlEditor": next.sqlEditor = d.sqlEditor; break;
    case "safety": next.safety = d.safety; break;
    default: break;
  }
  return next;
}

/* ── the tab ────────────────────────────────────────────────────────────── */

export type ConnectionSection = "connection" | "properties" | "dbInfo" | "dataTypes" | "search" | "drivers";

export function ConnectionPropertiesTab({
  connection,
  profileId,
  initialSection = "connection",
  sectionNonce,
  initialDraft,
  onSaved,
  onOpenObject,
  onDisconnect,
  onConnect,
  onRefresh,
  onConnected,
}: {
  /** Live connection when this profile is currently open (for server info). */
  connection: ActiveConnection | null;
  /** null = NEW connection mode: same page, empty draft, Test / Save & Connect. */
  profileId: string | null;
  /** New-connection mode: pre-fill these fields over the defaults (e.g. the
   *  bundled Exasol Personal profile when a direct connect couldn't proceed). */
  initialDraft?: Partial<{ name: string; notes: string; host: string; port: string; schema: string; username: string; sslMode: string; compression: boolean; driverId: string; fingerprint?: string; sslCa?: string; authMethod?: string; network?: NetworkSettings | null }>;
  initialSection?: ConnectionSection;
  /** Bumped when the host tab is re-targeted at a section while open. */
  sectionNonce?: number;
  onSaved?: () => void;
  onOpenObject?: (schema: string, name: string) => void;
  onDisconnect?: () => void;
  onConnect?: () => void;
  onRefresh?: () => void;
  /** New-connection mode: called after Save & Connect succeeds. */
  onConnected?: (profile: ConnectionProfile, server: ServerInfo) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<ConnectionSection>(initialSection);
  useEffect(() => {
    if (sectionNonce !== undefined) setMode(initialSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionNonce]);
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [settings, setSettings] = useState<ConnSettings | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const isNew = profileId === null;
  const [profileDraft, setProfileDraft] = useState<{ name: string; notes: string; host: string; port: string; schema: string; username: string; password: string; sslMode: string; compression: boolean; driverId: string; fingerprint?: string; sslCa?: string; authMethod?: string; network?: NetworkSettings | null }>({ name: "", notes: "", host: "", port: "", schema: "", username: "", password: "", sslMode: "verify_identity", compression: false, driverId: "sqlx-exasol", fingerprint: "", sslCa: "", authMethod: "password" });
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [driverReady, setDriverReady] = useState<Record<string, DriverReadiness>>({});
  const [testState, setTestState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false });
  const [profileSnapshot, setProfileSnapshot] = useState<string>("");
  const [showPw, setShowPw] = useState(false);
  // Connected-for ticker (like the classic "Connected - 00:11:39").
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  // Keep the driver dropdown IN SYNC with installs happening elsewhere: a
  // Marketplace install (market:done) or a runtime setup (studio:drivers-
  // changed) re-checks readiness so the new driver appears without a remount.
  useEffect(() => {
    if (!drivers.length) return;
    const refresh = () => {
      void (async () => {
        const next: Record<string, DriverReadiness> = {};
        await Promise.all(
          drivers.map(async (dr) => {
            next[dr.id] = await ipc
              .driverStatus(dr.id)
              .then((st) => ({ ready: st.ready, supported: st.supported, hint: st.hint }))
              .catch(() => ({ ready: false, supported: false, hint: "" }));
          }),
        );
        setDriverReady(next);
      })();
    };
    window.addEventListener("studio:drivers-changed", refresh);
    let un: UnlistenFn | undefined;
    if (isTauri()) {
      void listen("market:done", refresh).then((u) => (un = u)).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("studio:drivers-changed", refresh);
      un?.();
    };
  }, [drivers]);

  // A certificate trusted in the connect window is pinned in this form too
  // (after a Test it is kept by Apply / Save).
  useEffect(() => {
    if (!isTauri()) return;
    let un: UnlistenFn | undefined;
    let alive = true;
    void listen<TrustedCertificate>(EV_TRUSTED, ({ payload }) => {
      setProfileDraft((d) =>
        d.host.trim() === payload.host.trim() && String(d.port) === String(payload.port) ? { ...d, fingerprint: payload.fingerprint } : d,
      );
    })
      .then((u) => (alive ? (un = u) : u()))
      .catch(() => undefined);
    return () => {
      alive = false;
      un?.();
    };
  }, []);

  const [cat, setCat] = useState<CategoryId>("authentication");
  const [query, setQuery] = useState("");
  const [exasolOpen, setExasolOpen] = useState(true);
  const [tpl, setTpl] = useState<string>("SELECT ALL");

  useEffect(() => {
    let dead = false;
    void (async () => {
      ipc
        .listDrivers()
        .then(async (d) => {
          if (dead) return;
          setDrivers(d);
          const next: Record<string, DriverReadiness> = {};
          await Promise.all(
            d.map(async (dr) => {
              next[dr.id] = await ipc
                .driverStatus(dr.id)
                .then((st) => ({ ready: st.ready, supported: st.supported, hint: st.hint }))
                .catch(() => ({ ready: false, supported: false, hint: "" }));
            }),
          );
          if (!dead) setDriverReady(next);
        })
        .catch(() => undefined);
      if (profileId === null) {
        // Read only known fields from initialDraft (never spread it): a stray
        // caller arg (e.g. a click event) must not pollute the draft, which
        // would blow up the JSON.stringify snapshots below and black-screen the
        // form. Password is never pre-filled.
        const d = (initialDraft ?? {}) as Partial<{ name: string; notes: string; host: string; port: string; schema: string; username: string; sslMode: string; compression: boolean; driverId: string; fingerprint?: string; sslCa?: string; authMethod?: string; network?: NetworkSettings | null }>;
        const draft = {
          name: typeof d.name === "string" ? d.name : "New Connection",
          notes: typeof d.notes === "string" ? d.notes : "",
          host: typeof d.host === "string" ? d.host : "127.0.0.1",
          port: typeof d.port === "string" ? d.port : "8563",
          schema: typeof d.schema === "string" ? d.schema : "",
          username: typeof d.username === "string" ? d.username : "sys",
          password: "",
          // New connections verify the certificate; Exasol's self-signed one
          // is offered for trust (pinning) on the first connect.
          sslMode: typeof d.sslMode === "string" ? d.sslMode : "verify_identity",
          compression: typeof d.compression === "boolean" ? d.compression : false,
          driverId: typeof d.driverId === "string" ? d.driverId : "sqlx-exasol",
          fingerprint: typeof d.fingerprint === "string" ? d.fingerprint : "",
          sslCa: typeof d.sslCa === "string" ? d.sslCa : "",
          authMethod: typeof d.authMethod === "string" ? d.authMethod : "password",
        };
        if (dead) return;
        setProfile(null);
        setProfileDraft(draft);
        setProfileSnapshot(JSON.stringify(draft));
        const st = structuredClone(DEFAULT_CONN_SETTINGS);
        setSettings(st);
        setSavedSnapshot(JSON.stringify(st));
        return;
      }
      const profiles = await ipc.listConnectionProfiles().catch(() => []);
      const p = profiles.find((x) => x.id === profileId) ?? null;
      const st = await loadConnSettings(profileId);
      if (dead) return;
      setProfile(p);
      const draft = {
        name: p?.name ?? "", notes: p?.notes ?? "", host: p?.host ?? "", port: String(p?.port ?? 8563),
        schema: p?.schema ?? "", username: p?.username ?? "", password: "",
        sslMode: p?.sslMode ?? "preferred", compression: p?.compression ?? false, driverId: p?.driverId ?? "sqlx-exasol",
        fingerprint: p?.fingerprint ?? "", sslCa: p?.sslCa ?? "", authMethod: p?.authMethod ?? "password",
        network: p?.network ?? null,
      };
      setProfileDraft(draft);
      setProfileSnapshot(JSON.stringify(draft));
      setSettings(st);
      setSavedSnapshot(JSON.stringify(st));
    })();
    return () => { dead = true; };
  }, [profileId]);

  const dirtySettings = settings !== null && JSON.stringify(settings) !== savedSnapshot;
  const dirtyProfile = JSON.stringify(profileDraft) !== profileSnapshot;
  const dirty = dirtySettings || dirtyProfile;

  const patch = (fn: (s: ConnSettings) => void) =>
    setSettings((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next);
      return next;
    });

  /** The draft as a full profile (for test / save in NEW mode). */
  function draftProfile(): ConnectionProfile {
    return {
      id: profile?.id ?? "",
      name: profileDraft.name.trim() || `${profileDraft.username}@${profileDraft.host}`,
      host: profileDraft.host.trim(),
      port: checkPort(profileDraft.port).ok ? Number(profileDraft.port) : 0,
      username: profileDraft.username.trim(),
      password: profileDraft.password,
      schema: profileDraft.schema.trim() || null,
      notes: profileDraft.notes,
      sslMode: profileDraft.sslMode,
      compression: profileDraft.compression,
      driverId: profileDraft.driverId,
      fingerprint: profileDraft.fingerprint?.trim() || null,
      sslCa: profileDraft.sslCa?.trim() || null,
      authMethod: profileDraft.authMethod || "password",
      network: profileDraft.network ?? null,
    };
  }

  async function testConnection() {
    const draft = draftProfile();
    // Prefer the dedicated floating connect window (shows the ping → auth → db
    // flow). Fall back to an inline test when it isn't available (browser/mock).
    if (await openConnectWindow({ draft, mode: "test" })) return;
    setTestState({ busy: true });
    try {
      const info = await ipc.testConnection(draft);
      setTestState({ busy: false, ok: true, message: `${info.databaseName ?? "Exasol"} · ${info.version ?? ""}` });
    } catch (e) {
      setTestState({ busy: false, ok: false, message: errorMessage(e) });
    }
  }

  async function saveAndConnect() {
    if (busy) return;
    const draft = draftProfile();
    // The floating connect window saves + connects + hands the session back to
    // the app (EV_ESTABLISHED → App adopts it), so we don't drive adoption here.
    // Fall back to an inline save+connect when the window can't open (browser/mock).
    if (await openConnectWindow({ draft, mode: "connect" })) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await ipc.saveConnectionProfile(draft);
      if (settings) await ipc.connectionSettingsSet(saved.id, settings);
      const server = await ipc.connect(saved.id);
      await onConnected?.(saved, server);
      onSaved?.();
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 1600);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!settings || busy || profileId === null) return;
    setBusy(true);
    setError(null);
    try {
      if (dirtyProfile && profile) {
        const saved = await ipc.saveConnectionProfile({
          ...profile,
          name: profileDraft.name.trim() || profile.name,
          notes: profileDraft.notes,
          host: profileDraft.host.trim() || profile.host,
          // An invalid port is refused by the backend with the reason.
          port: checkPort(profileDraft.port).ok ? Number(profileDraft.port) : 0,
          schema: profileDraft.schema.trim() || null,
          username: profileDraft.username.trim() || profile.username,
          sslMode: profileDraft.sslMode,
          compression: profileDraft.compression,
          driverId: profileDraft.driverId,
          fingerprint: profileDraft.fingerprint?.trim() || null,
          sslCa: profileDraft.sslCa?.trim() || null,
          authMethod: profileDraft.authMethod || "password",
          network: profileDraft.network ?? null,
          // Blank keeps the stored password, unless the server, user or
          // sign-in changed (server-side rule). "This session only" moves the
          // typed one to memory right after (setSessionPassword clears it).
          password: profileDraft.password,
        });
        setProfile(saved);
        // "This session only": the typed password lives in memory for this run
        // and every saved copy (file, keychain) is removed.
        if (settings.auth.passwordPolicy === "session" && profileDraft.password) {
          await ipc.setSessionPassword(saved.id, profileDraft.password);
        }
        const draft = { ...profileDraft, password: "" };
        setProfileDraft(draft);
        setProfileSnapshot(JSON.stringify(draft));
      }
      await ipc.connectionSettingsSet(profileId, settings);
      // The assistant's copy of a connection follows its safety settings
      // before "Applied" shows (App also re-grants on the event).
      if (connectedLive) {
        try {
          await agentClient.grantConnection(profileId);
        } catch (e) {
          // Saved, but the assistant may still hold the old settings: say so
          // instead of showing "Applied".
          setSavedSnapshot(JSON.stringify(settings));
          window.dispatchEvent(new CustomEvent("studio:conn-settings-changed", { detail: { profileId } }));
          setError(`Saved, but the assistant could not be updated (${errorMessage(e)}). Disconnect and connect again before using the assistant on it.`);
          return;
        }
      }
      setSavedSnapshot(JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent("studio:conn-settings-changed", { detail: { profileId } }));
      onSaved?.();
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 1600);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const filteredCats = CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-editor text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading connection properties…
      </div>
    );
  }
  const s = settings;
  const connectedLive = connection?.profile.id === profileId ? connection : null;
  // Studio's own managed local DB (vs a hand-made local connection) —
  // it authenticates with the master password, everything else with its own.
  const isManagedLocal =
    /managed automatically by exasol studio/i.test(profile?.notes ?? "") || profile?.name === "Exasol Personal (local)";

  /* ── category page renderers ── */
  const page = (() => {
    switch (cat) {
      case "dbProfile":
        return (
          <SectionCard title="Database Profile" description="How Exasol Studio understands this database. The profile is detected from the server and drives which object types, actions and editors are available.">
            <InputRow label="Settings Format" value="Auto Detect (Exasol)" onChange={() => undefined} width="w-64" />
            <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
              <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Database Type</span>
              <span className="flex items-center gap-1.5 font-mono text-[12.5px] text-foreground"><Check className="h-3.5 w-3.5 text-primary" /> Exasol</span>
            </div>
            <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
              <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Driver Type</span>
              <span className="font-mono text-[12.5px] text-foreground">{profile?.driverId ?? "sqlx-exasol"} (native websocket)</span>
            </div>
            <div className="flex items-center gap-3 py-2">
              <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Server Version</span>
              <span className="font-mono text-[12.5px] text-foreground">{connectedLive?.server.version ?? "— connect to read"}</span>
            </div>
          </SectionCard>
        );
      case "driverProps": {
        // Only parameters this connection really sends; encryption and
        // compression are edited on the Connection tab.
        const rows: { param: string; value: string; def: string; edit: (v: string) => void }[] = [
          {
            param: "connectionPoolSize", value: String(s.driver.connectionPoolSize), def: "4",
            edit: (v) => patch((n) => { n.driver.connectionPoolSize = Math.max(1, Math.min(16, Number(v) || 4)); }),
          },
          {
            param: "querytimeout", value: String(s.driver.queryTimeoutSeconds), def: "0",
            edit: (v) => patch((n) => { n.driver.queryTimeoutSeconds = Math.max(0, Number(v) || 0); }),
          },
        ];
        return (
          <SectionCard title="Driver Properties" description="Driver parameters for this connection: connectionPoolSize applies on the next connect, querytimeout (seconds, 0 = none) to each new SQL tab session. Encryption and compression are edited on the Connection tab.">
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-secondary text-left text-muted-foreground">
                    {["Parameter", "Value", "Driver Default", ""].map((h) => (
                      <th key={h} className="border-b border-border px-2.5 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const edited = r.value !== r.def;
                    return (
                      <tr key={r.param} className="border-b border-border/60 last:border-0">
                        <td className="px-2.5 py-1.5 font-mono text-foreground">{r.param}</td>
                        <td className="px-2.5 py-1.5">
                          <input
                            value={r.value}
                            aria-label={r.param}
                            onChange={(e) => r.edit(e.target.value)}
                            className="h-7 w-28 rounded border border-border bg-secondary/30 px-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-muted-foreground/70">{r.def}</td>
                        <td className="px-2.5 py-1.5 text-[11px] text-primary">{edited ? "Edited" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        );
      }
      case "authentication":
        return (
          <div className="space-y-4">
            <SectionCard title="Database Password" description="What to do with the connection password. Saved passwords are encrypted with the vault's master password.">
              <RadioRow
                options={[
                  { value: "save", label: "Save Between Sessions", hint: "Encrypted at rest with the vault key" },
                  { value: "session", label: "Save During Session", hint: "Never written to disk — you re-enter it after a restart" },
                  { value: "clear", label: "Clear at Disconnect", hint: "The stored password is blanked when the connection closes" },
                ]}
                value={s.auth.passwordPolicy}
                onChange={(v) => patch((n) => { n.auth.passwordPolicy = v; })}
              />
            </SectionCard>
          </div>
        );
      case "physical":
        return (
          <div className="space-y-4">
            <SectionCard title="Use a Single Shared Physical Connection" description="Share ONE physical connection for everything on this database. Enable only when the server limits physical connections — it restricts multitasking (one statement runs at a time). Applies on the next connect.">
              <CheckRow label="Use a Single Shared Physical Connection" checked={s.physical.singleConnection} onChange={(v) => patch((n) => { n.physical.singleConnection = v; })} />
            </SectionCard>
            <SectionCard title="Validation and Keep-Alive SQL" description="The SQL used when checking that a physical connection is alive. Leave empty for the default (SELECT 1).">
              <InputRow label="Validation and Keep-Alive SQL" value={s.physical.validationSql} onChange={(v) => patch((n) => { n.physical.validationSql = v; })} placeholder="SELECT 1" />
            </SectionCard>
            <SectionCard title="Connection Keep-Alive" description="Run the validation statement for a connection idle longer than the interval, so the server does not close it for inactivity. Starts on the next connect.">
              <CheckRow label="Connection Keep-Alive" checked={s.physical.keepAlive} onChange={(v) => patch((n) => { n.physical.keepAlive = v; })} />
              <InputRow label="Connection Idle Time (seconds)" value={String(s.physical.idleSeconds)} onChange={(v) => patch((n) => { n.physical.idleSeconds = Math.max(10, Number(v) || 120); })} width="w-24" />
            </SectionCard>
          </div>
        );
      case "transaction":
        return (
          <div className="space-y-4">
            <SectionCard title="Auto Commit" description="With auto-commit on, every statement commits as its own transaction. Off, statements group into transactions ended by COMMIT or ROLLBACK. This is the default for new SQL tabs; each tab can switch with its own toggle.">
              <CheckRow label="Auto Commit" checked={s.transaction.autoCommit} onChange={(v) => patch((n) => { n.transaction.autoCommit = v; })} />
            </SectionCard>
            <SectionCard title="Uncommitted changes" description="Closing a tab, disconnecting or quitting with uncommitted changes always asks: Commit, Roll back, or Cancel. Nothing is committed or rolled back without asking. Grid edits join the tab's open transaction; with auto-commit on they save together or not at all." />
            <SectionCard title="Transaction Isolation" description="Exasol always runs SERIALIZABLE, the strictest level; it cannot be changed." />
          </div>
        );
      case "hooks":
        return (
          <SectionCard title="Database Connection Hooks" description="SQL sent to the server right after a successful connect and just before disconnecting. Problems are logged and never block the connection.">
            <CheckRow label="Run SQL at Connect" checked={s.hooks.connectEnabled} onChange={(v) => patch((n) => { n.hooks.connectEnabled = v; })} />
            <textarea
              value={s.hooks.connectSql}
              onChange={(e) => patch((n) => { n.hooks.connectSql = e.target.value; })}
              rows={4}
              spellCheck={false}
              placeholder="ALTER SESSION SET QUERY_TIMEOUT = 300;"
              disabled={!s.hooks.connectEnabled}
              className="mb-3 w-full rounded-md border border-border bg-secondary/30 px-2.5 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/60 disabled:opacity-50"
            />
            <CheckRow label="Run SQL at Disconnect" checked={s.hooks.disconnectEnabled} onChange={(v) => patch((n) => { n.hooks.disconnectEnabled = v; })} />
            <textarea
              value={s.hooks.disconnectSql}
              onChange={(e) => patch((n) => { n.hooks.disconnectSql = e.target.value; })}
              rows={4}
              spellCheck={false}
              disabled={!s.hooks.disconnectEnabled}
              className="w-full rounded-md border border-border bg-secondary/30 px-2.5 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/60 disabled:opacity-50"
            />
          </SectionCard>
        );
      case "color":
        return (
          <SectionCard title="Color and Border" description="Give this connection an accent color so its rows and tabs are recognizable at a glance — the classic guard against running a dev statement on prod.">
            <div className="flex items-center gap-3 border-b border-border/60 py-2">
              <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Color</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => patch((n) => { n.color.accent = null; })}
                  title="No color"
                  className={cn("flex h-6 w-6 items-center justify-center rounded-md border text-[10px] text-muted-foreground", s.color.accent === null ? "border-primary" : "border-border")}
                >
                  —
                </button>
                {ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => patch((n) => { n.color.accent = c; })}
                    title={c}
                    className={cn("h-6 w-6 rounded-md border-2", s.color.accent === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <CheckRow label="SQL tabs" checked={s.color.sqlTabs} onChange={(v) => patch((n) => { n.color.sqlTabs = v; })} />
            <CheckRow label="Show in Database Connection name" checked={s.color.showInName} onChange={(v) => patch((n) => { n.color.showInName = v; })} />
          </SectionCard>
        );
      case "safety":
        return (
          <div className="space-y-4">
            <SectionCard title="Environment" description="Tag the connection so its tabs and the title bar show where statements will run. Prod always asks before statements that destroy data, and before saving grid edits.">
              <RadioRow
                options={ENVIRONMENTS.map((e) => ({ value: e.value, label: e.label, hint: e.value === "prod" ? "Confirms DROP, TRUNCATE, DELETE/UPDATE without WHERE, and grid edits" : undefined }))}
                value={s.safety.env}
                onChange={(v) => patch((n) => { n.safety.env = v as Environment; })}
              />
            </SectionCard>
            <SectionCard title="Read-only connection" description="Only statements that change nothing run: queries, session settings and transaction control. Inserts, updates, DDL, grants, scripts, data loads and grid edits are refused before they reach the server — in the editor, notebooks, object menus and the assistant. A query can still call a UDF that writes elsewhere, and BucketFS uses its own credentials: for a guarantee, sign in with a database user that has only SELECT privileges.">
              <CheckRow label="Read-only connection" checked={s.safety.readOnly} onChange={(v) => patch((n) => { n.safety.readOnly = v; })} />
            </SectionCard>
            <SectionCard title="Confirm destructive statements" description="Ask before running DROP, TRUNCATE, and DELETE or UPDATE without a WHERE clause. Always on for Prod.">
              <CheckRow label="Confirm destructive statements" checked={s.safety.confirmDangerous || s.safety.env === "prod"} onChange={(v) => patch((n) => { n.safety.confirmDangerous = v; })} />
            </SectionCard>
          </div>
        );
      case "sqlEditor":
        return (
          <div className="space-y-4">
            <SectionCard title="Initial Database/Schema Selection" description="What the schema drop-down starts with when a new SQL tab opens on this connection.">
              <RadioRow
                options={[
                  { value: "default", label: "The Connection Default" },
                  { value: "none", label: "None" },
                  { value: "recent", label: "Most Recently Used" },
                ]}
                value={s.sqlEditor.initialSchema}
                onChange={(v) => patch((n) => { n.sqlEditor.initialSchema = v; })}
              />
            </SectionCard>
            <SectionCard title="Handling loss of Connection" description="What happens when the connection drops while a script runs. Reconnect restores the connection; Reconnect and re-execute also retries the statement that failed.">
              <RadioRow
                options={[
                  { value: "none", label: "No Reconnect" },
                  { value: "reconnect", label: "Reconnect" },
                  { value: "reexecute", label: "Reconnect and re-execute" },
                ]}
                value={s.sqlEditor.lossHandling}
                onChange={(v) => patch((n) => { n.sqlEditor.lossHandling = v; })}
              />
            </SectionCard>
          </div>
        );
    }
  })();

  const trustDraft: TrustDraft = {
    host: profileDraft.host,
    port: profileDraft.port,
    sslMode: profileDraft.sslMode,
    fingerprint: profileDraft.fingerprint ?? "",
    sslCa: profileDraft.sslCa ?? "",
    authMethod: profileDraft.authMethod ?? "password",
  };
  const patchTrust = (patch: Partial<TrustDraft>) => setProfileDraft((d) => ({ ...d, ...patch }));
  const usesToken = (profileDraft.authMethod ?? "password") !== "password";
  const secretLabel = AUTH_METHODS.find((m) => m.value === (profileDraft.authMethod ?? "password"))?.secret ?? "Password";
  // What a test or connect needs before it can start.
  const canTry = checkHost(profileDraft.host).ok && checkPort(profileDraft.port).ok && (usesToken || !!profileDraft.username.trim());

  const editRow = (
    label: string,
    key: "name" | "notes" | "host" | "port" | "schema" | "username" | "password",
    opts?: { type?: string; placeholder?: string; onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void },
  ) => (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-56 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <input
        type={opts?.type ?? "text"}
        value={profileDraft[key]}
        placeholder={opts?.placeholder}
        onChange={(e) => setProfileDraft((d) => ({ ...d, [key]: e.target.value }))}
        onPaste={opts?.onPaste}
        className="h-8 w-full max-w-md rounded-md border border-border bg-secondary/30 px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60"
      />
    </div>
  );
  /** A pasted JDBC URL / exa:// URL / pyexasol DSN fills the address fields. */
  function fillFromPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const parsed = parseDsn(e.clipboardData.getData("text"));
    if (!parsed) return;
    e.preventDefault();
    setProfileDraft((d) => ({
      ...d,
      host: parsed.host,
      ...(parsed.port ? { port: parsed.port } : {}),
      ...(parsed.username ? { username: parsed.username } : {}),
      ...(parsed.schema ? { schema: parsed.schema } : {}),
      ...(parsed.fingerprint ? { fingerprint: parsed.fingerprint } : {}),
      ...(parsed.sslMode ? { sslMode: parsed.sslMode } : {}),
    }));
  }

  const uptime = (() => {
    if (!connectedLive?.connectedAt) return null;
    const total = Math.max(0, Math.floor((Date.now() - connectedLive.connectedAt) / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const sec = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {/* One header for the whole connection workspace — Connection,
          Properties, Database Info, Data Types and Search all live here so
          there is exactly ONE page to maintain. */}
      <div className="shrink-0 border-b border-border px-6 pt-3">
        <div className="flex items-start gap-2.5">
          <Database className="mt-0.5 h-5 w-5" style={{ color: s.color.accent ?? "var(--primary)" }} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-foreground">
              Database Connection: {isNew ? profileDraft.name || "New Connection" : (profile?.name ?? "Connection")}
            </h2>
            {(() => {
              const src = isNew ? profileDraft : profile;
              if (!src?.host) return null;
              const { url, driver } = connectionUrl(src);
              return (
                <p className="flex items-center gap-1.5 font-mono text-[11.5px] text-primary/90">
                  {url}
                  <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium tracking-wide text-muted-foreground uppercase">{driver}</span>
                </p>
              );
            })()}
          </div>
          {isNew ? null : (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                  Actions… <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {connectedLive ? (
                  <>
                    <DropdownMenuItem onClick={() => onRefresh?.()}>
                      <RefreshCcw className="h-3.5 w-3.5" /> Refresh objects
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDisconnect?.()} className="text-destructive focus:text-destructive">
                      <Unplug className="h-3.5 w-3.5" /> Disconnect
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={() => onConnect?.()}>
                    <Plug className="h-3.5 w-3.5" /> Connect
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className={cn("font-mono text-[11px]", connectedLive ? "text-muted-foreground" : "text-muted-foreground/70")}>
              {connectedLive ? `Connected · ${uptime ?? "00:00:00"}` : "Disconnected"}
            </span>
          </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1">
          {/* In new-connection mode the DB-scoped tabs need a saved+connected
              profile, so we HIDE them (rather than show dead disabled tabs)
              until Save & Connect succeeds. Only Connection + Drivers apply. */}
          {(([
            ["connection", "Connection", Plug],
            ["properties", "Properties", Settings2],
            ["dbInfo", "Database Info", Database],
            ["dataTypes", "Data Types", Type],
            ["drivers", "Drivers", Plug],
            ["search", "Search", Search],
          ] as const).filter(([id]) => !isNew || id === "connection" || id === "drivers")).map(([id, label, Ic]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                "relative flex h-8 items-center gap-1.5 px-3 text-[12.5px]",
                mode === id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Ic className="h-3.5 w-3.5" /> {label}
              {mode === id ? <span className="absolute inset-x-2 bottom-0 h-px bg-primary" /> : null}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mx-6 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>
      ) : null}

      {mode === "dbInfo" && profileId !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <DatabaseInfoPanel profileId={profileId} connectionName={profile?.name ?? ""} />
        </div>
      ) : mode === "dataTypes" && profileId !== null ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <DataTypesPanel profileId={profileId} connectionName={profile?.name ?? ""} />
        </div>
      ) : mode === "drivers" ? (
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
          <DriversSection activeDriverId={profileDraft.driverId} onStatusChange={setDriverReady} />
        </div>
      ) : mode === "search" && profileId !== null ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ObjectSearch
            key={profileId}
            profileId={profileId}
            onOpenObject={(schema, name) => onOpenObject?.(schema, name)}
            onClose={() => setMode("connection")}
          />
        </div>
      ) : mode === "connection" ? (
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
          <div className="mx-auto max-w-4xl space-y-4 p-6">
            <SectionCard title="Connection">
              {editRow("Name", "name")}
              {editRow("Notes", "notes", { placeholder: "Optional description" })}
            </SectionCard>
            <SectionCard title="Database">
              {editRow("Database Server", "host", { onPaste: fillFromPaste })}
              {editRow("Database Port", "port")}
              <AddressNote host={profileDraft.host} port={profileDraft.port} />
              {editRow("Initial Schema", "schema", { placeholder: "Optional" })}
              <div className="flex items-center gap-3 py-2">
                <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Server Info</span>
                <span className="font-mono text-[12.5px] text-muted-foreground">
                  {connectedLive ? `${connectedLive.server.databaseName ?? "Exasol"} · ${connectedLive.server.version ?? ""} · session ${connectedLive.server.sessionId}` : "— connect to read"}
                </span>
              </div>
            </SectionCard>
            <SectionCard title="Authentication">
              <SignInMethodRow draft={trustDraft} onChange={patchTrust} />
              {editRow(usesToken ? "Database Userid (not sent with a token)" : "Database Userid", "username")}
              <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                <span className="flex w-56 shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                  {secretLabel}
                  {/* The two setups people actually hit — spelled out on hover. */}
                  <span
                    className="inline-flex cursor-help"
                    title={"An Exasol Personal you installed yourself: the launcher printed its generated password.\nStudio's built-in Exasol Personal (local): use your master password (the one from vault setup)."}
                  >
                    <Info className="h-3 w-3 opacity-70" aria-label="Which password to use" />
                  </span>
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  value={profileDraft.password}
                  placeholder={isNew ? secretLabel : "Unchanged — type to replace"}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, password: e.target.value }))}
                  className="h-8 w-full max-w-md rounded-md border border-border bg-secondary/30 px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60"
                />
                <button onClick={() => setShowPw((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {/* Contextual password hint — always visible, tailored to the
                  connection so people aren't left guessing. */}
              <p className="border-b border-border/60 py-2 text-[11px] leading-relaxed text-muted-foreground">
                {isManagedLocal
                  ? "This is Studio's built-in Exasol Personal (local) — sign in with your master password (the one you set during vault setup)."
                  : "An Exasol Personal you installed yourself uses the password its launcher printed. Studio's own built-in Exasol Personal (local) uses your master password."}
              </p>
              <div className="flex items-center gap-3 py-2">
                <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Save Database Password</span>
                <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  {s.auth.passwordPolicy === "save" ? "Save Between Sessions" : s.auth.passwordPolicy === "session" ? "Save During Session" : "Clear at Disconnect"}
                  {/* In new-connection mode the Properties tab is hidden until
                      the connection is saved, so the jump-to-Properties link
                      would go nowhere — show a note instead. */}
                  {isNew ? (
                    <span className="text-muted-foreground/60">· change after saving</span>
                  ) : (
                    <button onClick={() => { setMode("properties"); setCat("authentication"); }} className="text-primary hover:underline">change</button>
                  )}
                </span>
              </div>
            </SectionCard>
            <SectionCard title="Options">
              <CheckRow label="Auto Commit" checked={s.transaction.autoCommit} onChange={(v) => patch((n) => { n.transaction.autoCommit = v; })} />
              <div className="flex items-center gap-3 border-b border-border/60 py-2">
                <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Driver Type</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-8 min-w-56 items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 text-[12.5px] text-foreground hover:border-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {(() => { const Ic = DRIVER_ICON[profileDraft.driverId]; return Ic ? <Ic className="h-3.5 w-3.5 text-primary" /> : null; })()}
                        {drivers.find((d) => d.id === profileDraft.driverId)?.name ?? profileDraft.driverId}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {/* Only INSTALLED drivers are selectable — everything else
                        lives in the Drivers tab with its Install button. */}
                    {(drivers.length ? drivers : [{ id: "sqlx-exasol", name: "Native websocket (built-in)" } as DriverInfo])
                      .filter((d) => (driverReady[d.id]?.ready ?? d.id === "sqlx-exasol") || d.id === profileDraft.driverId)
                      .map((d) => {
                        const Ic = DRIVER_ICON[d.id];
                        const ready = driverReady[d.id]?.ready ?? d.id === "sqlx-exasol";
                        return (
                          <DropdownMenuItem key={d.id} onClick={() => setProfileDraft((x) => ({ ...x, driverId: d.id }))}>
                            {d.id === profileDraft.driverId ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />}
                            {Ic ? <Ic className="h-3.5 w-3.5" /> : null} {d.name}
                            {!ready ? <span className="ml-auto rounded bg-warning/15 px-1 py-px text-[9px] font-medium text-warning uppercase">not installed</span> : null}
                          </DropdownMenuItem>
                        );
                      })}
                    <DropdownMenuItem onClick={() => setMode("drivers")}>
                      <Settings2 className="h-3.5 w-3.5" /> Manage drivers…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={() => setMode("drivers")}
                  title="Manage drivers (install runtimes, custom JARs)"
                  aria-label="Manage drivers"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                {profileDraft.driverId && !(driverReady[profileDraft.driverId]?.ready ?? profileDraft.driverId === "sqlx-exasol") ? (
                  <span className="text-[11px] text-warning">Runtime not installed — install it in the Drivers tab.</span>
                ) : null}
              </div>
              <ConnectionTrustFields draft={trustDraft} onChange={patchTrust} />
              <CheckRow label="Compression" checked={profileDraft.compression} onChange={(v) => setProfileDraft((x) => ({ ...x, compression: v }))} />
            </SectionCard>
            <SectionCard title="Network">
              <ConnectionNetworkFields network={profileDraft.network} isNew={isNew} onChange={(n) => setProfileDraft((x) => ({ ...x, network: n }))} />
            </SectionCard>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* category rail */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border bg-panel/40">
            <div className="p-2">
              <div className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2 [scrollbar-width:thin]">
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/70 uppercase">Connection Properties</p>
              {filteredCats.filter((c) => c.group === "root").map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)} className={cn("block w-full px-3 py-1.5 text-left text-[12.5px]", cat === c.id ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")}>
                  {c.label}
                </button>
              ))}
              <button onClick={() => setExasolOpen((v) => !v)} className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-left text-[12.5px] font-medium text-foreground">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", exasolOpen && "rotate-90")} /> Exasol
              </button>
              {exasolOpen
                ? filteredCats.filter((c) => c.group === "exasol").map((c) => (
                    <button key={c.id} onClick={() => setCat(c.id)} className={cn("block w-full py-1.5 pr-3 pl-7 text-left text-[12.5px]", cat === c.id ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")}>
                      {c.label}
                    </button>
                  ))
                : null}
            </div>
          </div>
          {/* category page */}
          <div className="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-width:thin]">
            <div className="mx-auto max-w-3xl p-6">{page}</div>
          </div>
        </div>
      )}

      {/* apply bar — only the editable sections need it */}
      {isNew ? (
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => void testConnection()}
              disabled={testState.busy || !canTry}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              {testState.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Test connection
            </button>
            {testState.message ? (
              <span className={cn("min-w-0 truncate text-[11.5px]", testState.ok ? "text-primary" : "text-destructive")} title={testState.message}>
                {testState.ok ? `Reachable — ${testState.message}` : testState.message}
              </span>
            ) : null}
          </div>
          <button
            onClick={() => void saveAndConnect()}
            disabled={busy || !canTry}
            className="cta-glow flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : savedTick ? <Check className="h-3 w-3" /> : null}
            Save &amp; Connect
          </button>
        </div>
      ) : mode !== "connection" && mode !== "properties" ? null : (
      <div className="flex h-11 shrink-0 items-center justify-between border-t border-border px-4">
        {mode === "properties" ? (
          <button
            onClick={() => setSettings(categoryDefaults(s, cat))}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Defaults…
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            {/* The draft as edited, with the stored secret if none was typed. */}
            <button
              onClick={() => void testConnection()}
              disabled={testState.busy || !canTry}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              {testState.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Test connection
            </button>
            <span className={cn("min-w-0 truncate text-[11.5px]", testState.message ? (testState.ok ? "text-primary" : "text-destructive") : "text-muted-foreground")} title={testState.message}>
              {testState.message ? (testState.ok ? `Reachable — ${testState.message}` : testState.message) : "Server-side changes apply on the next connect."}
            </span>
          </div>
        )}
        <button
          onClick={() => void apply()}
          disabled={!dirty || busy}
          className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : savedTick ? <Check className="h-3 w-3" /> : null}
          {savedTick ? "Applied" : "Apply"}
        </button>
      </div>
      )}
    </div>
  );
}
