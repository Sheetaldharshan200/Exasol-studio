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
import { errorMessage, ipc, type ConnectionProfile, type DriverInfo, type ServerInfo } from "@/lib/ipc";
import type { ActiveConnection } from "@/state/useConnections";
import { cn } from "@/lib/utils";
import { DatabaseInfoPanel } from "@/features/workbench/DatabaseInfoPanel";
import { DataTypesPanel } from "@/features/workbench/DataTypesPanel";
import { ObjectSearch } from "@/features/workbench/ObjectSearch";
import { DriversSection, DRIVER_ICON, type DriverReadiness } from "@/features/connection/DriversSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ────────────────────────────────────────────────────────────────────────
 * Per-connection settings model. Stored as raw JSON per profile id (Rust
 * connection_settings.rs); the backend wires hooks / keep-alive / pool size /
 * password policy, the rest drive frontend behavior.
 * ──────────────────────────────────────────────────────────────────────── */

export type ConnSettings = {
  auth: { requireUserid: boolean; requirePassword: boolean; passwordPolicy: "save" | "session" | "clear" };
  driver: { connectionPoolSize: number; queryTimeoutSeconds: number };
  delimited: { begin: string; end: string; scripting: boolean; autoCompletion: boolean; export: boolean; actions: boolean };
  qualifiers: {
    objects: { scripting: boolean; navigator: boolean; autoCompletion: boolean; queryBuilder: boolean; export: boolean };
    fully: { navigator: boolean; autoCompletion: boolean; queryBuilder: boolean };
    columns: { scripting: boolean; autoCompletion: boolean; queryBuilder: boolean; export: boolean };
  };
  physical: { singleConnection: boolean; validationSql: string; keepAlive: boolean; idleSeconds: number };
  transaction: {
    autoCommit: boolean;
    askAlways: boolean;
    askWhenUncommitted: boolean;
    isolation: "none" | "serializable";
    commitBatchSize: number;
  };
  encoding: { textToBinary: string };
  sqlTemplates: Record<string, string>;
  hooks: { connectEnabled: boolean; connectSql: string; disconnectEnabled: boolean; disconnectSql: string };
  color: { accent: string | null; objectTabs: boolean; sqlTabs: boolean; resultTabs: boolean; showInName: boolean };
  sqlEditor: { initialSchema: "default" | "none" | "recent"; lossHandling: "none" | "reconnect" | "reexecute" };
  queryBuilder: { autoJoin: boolean; joinType: "fkpk" | "name"; generateJoinClause: boolean; sortColumns: boolean };
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  "SELECT ALL": "SELECT * FROM $$schema$$$$schemaseparator$$$$table$$",
  "SELECT ALL COLUMNS": "SELECT $$columns$$ FROM $$schema$$$$schemaseparator$$$$table$$",
  "SELECT ALL WHERE": "SELECT * FROM $$schema$$$$schemaseparator$$$$table$$ WHERE $$where$$",
  "SELECT COUNT": "SELECT COUNT(*) FROM $$schema$$$$schemaseparator$$$$table$$",
  "SELECT ROW COUNT": "SELECT COUNT(*) AS ROW_COUNT FROM $$schema$$$$schemaseparator$$$$table$$",
  "INSERT INTO TABLE": "INSERT INTO $$schema$$$$schemaseparator$$$$table$$ ($$columns$$) VALUES ($$values$$)",
  "UPDATE WHERE": "UPDATE $$schema$$$$schemaseparator$$$$table$$ SET $$column-values$$ WHERE $$where$$",
  "DELETE WHERE": "DELETE FROM $$schema$$$$schemaseparator$$$$table$$ WHERE $$where$$",
  "DROP TABLE": "DROP TABLE $$schema$$$$schemaseparator$$$$table$$",
};

export const DEFAULT_CONN_SETTINGS: ConnSettings = {
  auth: { requireUserid: false, requirePassword: false, passwordPolicy: "save" },
  driver: { connectionPoolSize: 4, queryTimeoutSeconds: 0 },
  delimited: { begin: '"', end: '"', scripting: true, autoCompletion: true, export: true, actions: true },
  qualifiers: {
    objects: { scripting: false, navigator: false, autoCompletion: true, queryBuilder: true, export: false },
    fully: { navigator: false, autoCompletion: false, queryBuilder: false },
    columns: { scripting: false, autoCompletion: false, queryBuilder: true, export: true },
  },
  physical: { singleConnection: false, validationSql: "", keepAlive: false, idleSeconds: 120 },
  transaction: { autoCommit: true, askAlways: false, askWhenUncommitted: true, isolation: "none", commitBatchSize: 100 },
  encoding: { textToBinary: "UTF-8" },
  sqlTemplates: { ...DEFAULT_TEMPLATES },
  hooks: { connectEnabled: false, connectSql: "", disconnectEnabled: false, disconnectSql: "" },
  color: { accent: null, objectTabs: true, sqlTabs: true, resultTabs: true, showInName: true },
  sqlEditor: { initialSchema: "default", lossHandling: "reexecute" },
  queryBuilder: { autoJoin: true, joinType: "fkpk", generateJoinClause: true, sortColumns: false },
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(cur, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export async function loadConnSettings(profileId: string): Promise<ConnSettings> {
  const raw = await ipc.connectionSettingsGet(profileId).catch(() => null);
  return deepMerge(structuredClone(DEFAULT_CONN_SETTINGS), raw);
}

export const ACCENT_PRESETS = ["#e11d48", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#6366f1", "#a855f7", "#64748b"];

const SSL_MODES = ["preferred", "required", "verify_ca", "verify_identity", "disabled"];

/** Driver-aware connection URL for the header — shows WHAT will speak to the
 *  server, not a generic scheme. */
export function connectionUrl(p: { host: string; port: number | string; driverId?: string }): { url: string; driver: string } {
  const hp = `${p.host}:${p.port}`;
  switch (p.driverId) {
    case "jdbc": return { url: `jdbc:exa:${hp}`, driver: "Exasol JDBC" };
    case "odbc": return { url: `odbc:exa:${hp}`, driver: "Exasol ODBC" };
    case "pyexasol": return { url: `pyexasol://${hp}`, driver: "PyExasol" };
    case "sqlalchemy": return { url: `exa+websocket://${hp}`, driver: "SQLAlchemy" };
    default: return { url: `exa:ws://${hp}`, driver: "Native websocket" };
  }
}

const ENCODINGS = [
  "UTF-8", "ISO-8859-1", "ISO-8859-15", "US-ASCII", "UTF-16", "UTF-16BE", "UTF-16LE",
  "windows-1252", "Big5", "GB18030", "GB2312", "GBK", "EUC-JP", "EUC-KR", "Shift_JIS",
];

/* ── shared building blocks (info-page design language) ─────────────────── */

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
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

function PickerRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-56 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 min-w-44 items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 text-[12.5px] text-foreground hover:border-muted-foreground">
            {value}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <DropdownMenuItem key={o} onClick={() => onChange(o)}>
              {o === value ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />} {o}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ── Properties categories ──────────────────────────────────────────────── */

type CategoryId =
  | "dbProfile" | "driverProps"
  | "authentication" | "delimited" | "qualifiers" | "physical" | "transaction"
  | "encoding" | "sqlStatements" | "hooks" | "color" | "sqlEditor" | "queryBuilder";

const CATEGORIES: { id: CategoryId; label: string; group: "root" | "exasol" }[] = [
  { id: "dbProfile", label: "Database Profile", group: "root" },
  { id: "driverProps", label: "Driver Properties", group: "root" },
  { id: "authentication", label: "Authentication", group: "exasol" },
  { id: "delimited", label: "Delimited Identifiers", group: "exasol" },
  { id: "qualifiers", label: "Qualifiers", group: "exasol" },
  { id: "physical", label: "Physical Connection", group: "exasol" },
  { id: "transaction", label: "Transaction", group: "exasol" },
  { id: "encoding", label: "Encoding", group: "exasol" },
  { id: "sqlStatements", label: "SQL Statements", group: "exasol" },
  { id: "hooks", label: "Connection Hooks", group: "exasol" },
  { id: "color", label: "Color and Border", group: "exasol" },
  { id: "sqlEditor", label: "SQL Editor", group: "exasol" },
  { id: "queryBuilder", label: "Query Builder", group: "exasol" },
];

/** Defaults for one category only (the "Defaults…" button). */
function categoryDefaults(s: ConnSettings, cat: CategoryId): ConnSettings {
  const d = structuredClone(DEFAULT_CONN_SETTINGS);
  const next = structuredClone(s);
  switch (cat) {
    case "authentication": next.auth = d.auth; break;
    case "driverProps": next.driver = d.driver; break;
    case "delimited": next.delimited = d.delimited; break;
    case "qualifiers": next.qualifiers = d.qualifiers; break;
    case "physical": next.physical = d.physical; break;
    case "transaction": next.transaction = d.transaction; break;
    case "encoding": next.encoding = d.encoding; break;
    case "sqlStatements": next.sqlTemplates = { ...DEFAULT_TEMPLATES }; break;
    case "hooks": next.hooks = d.hooks; break;
    case "color": next.color = d.color; break;
    case "sqlEditor": next.sqlEditor = d.sqlEditor; break;
    case "queryBuilder": next.queryBuilder = d.queryBuilder; break;
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
  initialDraft?: Partial<{ name: string; notes: string; host: string; port: string; schema: string; username: string; sslMode: string; compression: boolean; driverId: string }>;
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
  const [profileDraft, setProfileDraft] = useState<{ name: string; notes: string; host: string; port: string; schema: string; username: string; password: string; sslMode: string; compression: boolean; driverId: string }>({ name: "", notes: "", host: "", port: "", schema: "", username: "", password: "", sslMode: "required", compression: false, driverId: "sqlx-exasol" });
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
        const draft = {
          name: "New Connection", notes: "", host: "127.0.0.1", port: "8563",
          schema: "", username: "sys", password: "", sslMode: "required", compression: false, driverId: "sqlx-exasol",
          // Pre-fill from a supplied draft (e.g. the bundled Exasol Personal
          // profile) so the form isn't blank when a direct connect fell back
          // here. Password is never pre-filled.
          ...initialDraft,
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
      port: Number(profileDraft.port) || 8563,
      username: profileDraft.username.trim(),
      password: profileDraft.password,
      schema: profileDraft.schema.trim() || null,
      notes: profileDraft.notes,
      sslMode: profileDraft.sslMode,
      compression: profileDraft.compression,
      driverId: profileDraft.driverId,
    };
  }

  async function testConnection() {
    setTestState({ busy: true });
    try {
      const info = await ipc.testConnection(draftProfile());
      setTestState({ busy: false, ok: true, message: `${info.databaseName ?? "Exasol"} · ${info.version ?? ""}` });
    } catch (e) {
      setTestState({ busy: false, ok: false, message: errorMessage(e) });
    }
  }

  async function saveAndConnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await ipc.saveConnectionProfile(draftProfile());
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
          port: Number(profileDraft.port) || profile.port,
          schema: profileDraft.schema.trim() || null,
          username: profileDraft.username.trim() || profile.username,
          sslMode: profileDraft.sslMode,
          compression: profileDraft.compression,
          driverId: profileDraft.driverId,
          // Blank keeps the stored password (server-side rule).
          password: settings.auth.passwordPolicy === "session" ? "" : profileDraft.password,
        });
        setProfile(saved);
        const draft = { ...profileDraft, password: "" };
        setProfileDraft(draft);
        setProfileSnapshot(JSON.stringify(draft));
      }
      await ipc.connectionSettingsSet(profileId, settings);
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
  // Studio's own managed local DB (vs a hand-made local/nano connection) —
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
        const rows: { param: string; value: string; def: string; edit?: (v: string) => void }[] = [
          { param: "clientname", value: "Exasol Studio", def: "Exasol Studio" },
          {
            param: "connectionPoolSize", value: String(s.driver.connectionPoolSize), def: "4",
            edit: (v) => patch((n) => { n.driver.connectionPoolSize = Math.max(1, Math.min(16, Number(v) || 4)); }),
          },
          { param: "encryption", value: profile?.sslMode ?? "preferred", def: "preferred" },
          { param: "compression", value: profile ? String(Number(profile.compression)) : "0", def: "0" },
          {
            param: "querytimeout", value: String(s.driver.queryTimeoutSeconds), def: "0",
            edit: (v) => patch((n) => { n.driver.queryTimeoutSeconds = Math.max(0, Number(v) || 0); }),
          },
          { param: "fetchsize", value: "streamed (row cap per run)", def: "streamed" },
        ];
        return (
          <SectionCard title="Driver Properties" description="Driver-specific properties that fine-tune this connection. Changes override the driver defaults for this connection only and apply on the next connect. Encryption and compression are edited on the Connection tab.">
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-secondary text-left text-muted-foreground">
                    {["Origin", "Edited", "Parameter", "Value", "Driver Default"].map((h) => (
                      <th key={h} className="border-b border-border px-2.5 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const edited = r.value !== r.def;
                    return (
                      <tr key={r.param} className="border-b border-border/60 last:border-0">
                        <td className="px-2.5 py-1.5"><Plug className="h-3.5 w-3.5 text-muted-foreground" /></td>
                        <td className="px-2.5 py-1.5"><CheckBox checked={edited} onChange={() => undefined} disabled /></td>
                        <td className="px-2.5 py-1.5 font-mono text-foreground">{r.param}</td>
                        <td className="px-2.5 py-1.5">
                          {r.edit ? (
                            <input
                              value={r.value}
                              onChange={(e) => r.edit!(e.target.value)}
                              className="h-7 w-28 rounded border border-border bg-secondary/30 px-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
                            />
                          ) : (
                            <span className="font-mono text-muted-foreground">{r.value}</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-muted-foreground/70">{r.def}</td>
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
            <SectionCard title="Connection Authentication" description="If Userid or Password is not entered in the connection details, these settings decide whether Studio prompts for them when connecting.">
              <CheckRow label="Require Userid" checked={s.auth.requireUserid} onChange={(v) => patch((n) => { n.auth.requireUserid = v; })} />
              <CheckRow label="Require Password" checked={s.auth.requirePassword} onChange={(v) => patch((n) => { n.auth.requirePassword = v; })} />
            </SectionCard>
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
      case "delimited":
        return (
          <div className="space-y-4">
            <SectionCard title="Delimited Identifiers" description={'Delimited identifiers do not need to follow regular identifier rules (reserved words, spaces, mixed case). Exasol delimits with double quotes. Leave both fields empty to disable delimiting when generating SQL.'}>
              <InputRow label="Begin Identifier" value={s.delimited.begin} onChange={(v) => patch((n) => { n.delimited.begin = v.slice(0, 1); })} width="w-16" />
              <InputRow label="End Identifier" value={s.delimited.end} onChange={(v) => patch((n) => { n.delimited.end = v.slice(0, 1); })} width="w-16" />
              <p className="pt-2 text-[11.5px] text-muted-foreground">
                Example: <span className="font-mono">UPDATE {s.delimited.begin}SCOTT{s.delimited.end}.{s.delimited.begin}Phone #{s.delimited.end} SET {s.delimited.begin}Name{s.delimited.end} = 'Mia' WHERE {s.delimited.begin}Id{s.delimited.end} = 72</span>
              </p>
            </SectionCard>
            <SectionCard title="Use of Delimited Identifiers" description="Where Studio should generate delimited identifiers for schema, table and column names.">
              <CheckRow label="Scripting" checked={s.delimited.scripting} onChange={(v) => patch((n) => { n.delimited.scripting = v; })} />
              <CheckRow label="Auto-Completion / Query Builder" checked={s.delimited.autoCompletion} onChange={(v) => patch((n) => { n.delimited.autoCompletion = v; })} />
              <CheckRow label="Export" checked={s.delimited.export} onChange={(v) => patch((n) => { n.delimited.export = v; })} />
              <CheckRow label="Actions" checked={s.delimited.actions} onChange={(v) => patch((n) => { n.delimited.actions = v; })} />
            </SectionCard>
          </div>
        );
      case "qualifiers":
        return (
          <div className="space-y-4">
            <SectionCard title="Qualify Objects with Schema" description="Whether generated object names are qualified with the schema name.">
              <CheckRow label="Scripting" checked={s.qualifiers.objects.scripting} onChange={(v) => patch((n) => { n.qualifiers.objects.scripting = v; })} />
              <CheckRow label="References / Navigator Graphs" checked={s.qualifiers.objects.navigator} onChange={(v) => patch((n) => { n.qualifiers.objects.navigator = v; })} />
              <CheckRow label="Auto-Completion" checked={s.qualifiers.objects.autoCompletion} onChange={(v) => patch((n) => { n.qualifiers.objects.autoCompletion = v; })} />
              <CheckRow label="Query Builder" checked={s.qualifiers.objects.queryBuilder} onChange={(v) => patch((n) => { n.qualifiers.objects.queryBuilder = v; })} />
              <CheckRow label="Export" checked={s.qualifiers.objects.export} onChange={(v) => patch((n) => { n.qualifiers.objects.export = v; })} />
            </SectionCard>
            <SectionCard title="Fully Qualify Objects" description="Qualify with both database and schema where the database supports both.">
              <CheckRow label="References / Navigator Graphs" checked={s.qualifiers.fully.navigator} onChange={(v) => patch((n) => { n.qualifiers.fully.navigator = v; })} />
              <CheckRow label="Auto-Completion" checked={s.qualifiers.fully.autoCompletion} onChange={(v) => patch((n) => { n.qualifiers.fully.autoCompletion = v; })} />
              <CheckRow label="Query Builder" checked={s.qualifiers.fully.queryBuilder} onChange={(v) => patch((n) => { n.qualifiers.fully.queryBuilder = v; })} />
            </SectionCard>
            <SectionCard title="Qualify Columns" description="Whether column names are qualified with the table name. Table aliases always yield qualified columns; ambiguous columns are qualified automatically in auto-completion.">
              <CheckRow label="Scripting" checked={s.qualifiers.columns.scripting} onChange={(v) => patch((n) => { n.qualifiers.columns.scripting = v; })} />
              <CheckRow label="Auto-Completion" checked={s.qualifiers.columns.autoCompletion} onChange={(v) => patch((n) => { n.qualifiers.columns.autoCompletion = v; })} />
              <CheckRow label="Query Builder" checked={s.qualifiers.columns.queryBuilder} onChange={(v) => patch((n) => { n.qualifiers.columns.queryBuilder = v; })} />
              <CheckRow label="Export" checked={s.qualifiers.columns.export} onChange={(v) => patch((n) => { n.qualifiers.columns.export = v; })} />
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
            <SectionCard title="Auto Commit" description="With auto-commit on, every statement commits as its own transaction. Off, statements group into transactions ended by COMMIT or ROLLBACK. Affects new connections — reconnect to apply.">
              <CheckRow label="Auto Commit" checked={s.transaction.autoCommit} onChange={(v) => patch((n) => { n.transaction.autoCommit = v; })} />
            </SectionCard>
            <SectionCard title="Ask when Auto Commit is OFF" description="Whether a confirmation shows after executing requests while auto-commit is off.">
              <CheckRow label="Always" checked={s.transaction.askAlways} onChange={(v) => patch((n) => { n.transaction.askAlways = v; })} />
              <CheckRow label="When Uncommitted Updates" checked={s.transaction.askWhenUncommitted} onChange={(v) => patch((n) => { n.transaction.askWhenUncommitted = v; })} />
            </SectionCard>
            <SectionCard title="Transaction Isolation" description="Exasol always runs SERIALIZABLE — the strictest level. Shown here so the behavior is explicit; it cannot be lowered.">
              <PickerRow label="Transaction Isolation" value={s.transaction.isolation === "none" ? "Do not set" : "SERIALIZABLE"} options={["Do not set", "SERIALIZABLE"]} onChange={(v) => patch((n) => { n.transaction.isolation = v === "SERIALIZABLE" ? "serializable" : "none"; })} />
            </SectionCard>
            <SectionCard title="Commit Batch Size (rows)" description="After how many rows the data editor issues a COMMIT while saving grid edits. 0 = commit only when the save completes.">
              <InputRow label="Commit Batch Size (rows)" value={String(s.transaction.commitBatchSize)} onChange={(v) => patch((n) => { n.transaction.commitBatchSize = Math.max(0, Number(v) || 0); })} width="w-24" />
            </SectionCard>
          </div>
        );
      case "encoding":
        return (
          <SectionCard title="Text to Binary Encoding" description="Used when saving plain text into a binary data type in the database.">
            <PickerRow label="Text to Binary Encoding" value={s.encoding.textToBinary} options={ENCODINGS} onChange={(v) => patch((n) => { n.encoding.textToBinary = v; })} />
          </SectionCard>
        );
      case "sqlStatements":
        return (
          <SectionCard title="SQL Templates" description="Statements Studio generates from object menus and grid actions. Variables ($$schema$$, $$table$$, $$columns$$, $$where$$…) are replaced at execution.">
            <div className="overflow-hidden rounded-lg border border-border/70">
              {Object.keys(s.sqlTemplates).map((name) => (
                <button
                  key={name}
                  onClick={() => setTpl(name)}
                  className={cn(
                    "block w-full border-b border-border/60 px-2.5 py-1.5 text-left font-mono text-[11.5px] last:border-0",
                    name === tpl ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <textarea
              value={s.sqlTemplates[tpl] ?? ""}
              onChange={(e) => patch((n) => { n.sqlTemplates[tpl] = e.target.value; })}
              rows={3}
              spellCheck={false}
              className="mt-3 w-full rounded-md border border-border bg-secondary/30 px-2.5 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11.5px] text-muted-foreground">Template used for "{tpl}".</p>
              <button
                onClick={() => patch((n) => { n.sqlTemplates[tpl] = DEFAULT_TEMPLATES[tpl] ?? ""; })}
                className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset template
              </button>
            </div>
          </SectionCard>
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
            <CheckRow label="Object View tabs" checked={s.color.objectTabs} onChange={(v) => patch((n) => { n.color.objectTabs = v; })} />
            <CheckRow label="SQL tabs" checked={s.color.sqlTabs} onChange={(v) => patch((n) => { n.color.sqlTabs = v; })} />
            <CheckRow label="Result Set tabs" checked={s.color.resultTabs} onChange={(v) => patch((n) => { n.color.resultTabs = v; })} />
            <CheckRow label="Show in Database Connection name" checked={s.color.showInName} onChange={(v) => patch((n) => { n.color.showInName = v; })} />
          </SectionCard>
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
      case "queryBuilder":
        return (
          <div className="space-y-4">
            <SectionCard title="Query Builder Auto-Join" description="With auto-join enabled, tables added to the visual query builder join automatically to tables already present, by matching keys or column names.">
              <CheckRow label="Auto-Join Enabled" checked={s.queryBuilder.autoJoin} onChange={(v) => patch((n) => { n.queryBuilder.autoJoin = v; })} />
              <RadioRow
                label="Auto-Join Type"
                options={[
                  { value: "fkpk", label: "Match columns by FK/PK declarations" },
                  { value: "name", label: "Match columns with equal names" },
                ]}
                value={s.queryBuilder.joinType}
                onChange={(v) => patch((n) => { n.queryBuilder.joinType = v; })}
              />
            </SectionCard>
            <SectionCard title="Generate JOIN Clause" description="Generate joins as JOIN clauses rather than WHERE conditions.">
              <CheckRow label="Generate JOIN Clause in Query Builder" checked={s.queryBuilder.generateJoinClause} onChange={(v) => patch((n) => { n.queryBuilder.generateJoinClause = v; })} />
            </SectionCard>
            <SectionCard title="Sort the Columns in the Table Windows" description="Sort columns alphabetically in table windows instead of ordinal position.">
              <CheckRow label="Sort the Columns in the Table Windows" checked={s.queryBuilder.sortColumns} onChange={(v) => patch((n) => { n.queryBuilder.sortColumns = v; })} />
            </SectionCard>
          </div>
        );
    }
  })();

  const editRow = (
    label: string,
    key: "name" | "notes" | "host" | "port" | "schema" | "username" | "password",
    opts?: { type?: string; placeholder?: string },
  ) => (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="w-56 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <input
        type={opts?.type ?? "text"}
        value={profileDraft[key]}
        placeholder={opts?.placeholder}
        onChange={(e) => setProfileDraft((d) => ({ ...d, [key]: e.target.value }))}
        className="h-8 w-full max-w-md rounded-md border border-border bg-secondary/30 px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60"
      />
    </div>
  );

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
              const src = isNew ? { host: profileDraft.host, port: profileDraft.port, driverId: profileDraft.driverId } : profile;
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
              {editRow("Database Server", "host")}
              {editRow("Database Port", "port")}
              {editRow("Initial Schema", "schema", { placeholder: "Optional" })}
              <div className="flex items-center gap-3 py-2">
                <span className="w-56 shrink-0 text-[12px] text-muted-foreground">Server Info</span>
                <span className="font-mono text-[12.5px] text-muted-foreground">
                  {connectedLive ? `${connectedLive.server.databaseName ?? "Exasol"} · ${connectedLive.server.version ?? ""} · session ${connectedLive.server.sessionId}` : "— connect to read"}
                </span>
              </div>
            </SectionCard>
            <SectionCard title="Authentication">
              {editRow("Database Userid", "username")}
              <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                <span className="flex w-56 shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                  Database Password
                  {/* The two setups people actually hit — spelled out on hover. */}
                  <span
                    className="inline-flex cursor-help"
                    title={"Exasol Personal or nano (Docker): the default password is 'exasol'.\nStudio's built-in Exasol Personal (local): use your master password (the one from vault setup)."}
                  >
                    <Info className="h-3 w-3 opacity-70" aria-label="Which password to use" />
                  </span>
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  value={profileDraft.password}
                  placeholder={isNew ? "Password" : "Unchanged — type to replace"}
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
                  : "Exasol Personal or nano (Docker) use the password 'exasol' by default. Studio's own built-in Exasol Personal (local) uses your master password."}
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
              <PickerRow label="Encryption" value={profileDraft.sslMode} options={SSL_MODES} onChange={(v) => setProfileDraft((x) => ({ ...x, sslMode: v }))} />
              <CheckRow label="Compression" checked={profileDraft.compression} onChange={(v) => setProfileDraft((x) => ({ ...x, compression: v }))} />
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
              disabled={testState.busy || !profileDraft.host.trim() || !profileDraft.username.trim()}
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
            disabled={busy || !profileDraft.host.trim() || !profileDraft.username.trim()}
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
          <span className="text-[11.5px] text-muted-foreground">Server-side changes apply on the next connect.</span>
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
