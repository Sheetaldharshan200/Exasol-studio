import { useEffect, useMemo, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Download,
  KeyRound,
  Loader2,
  Lock,
  Plug,
  PlugZap,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import { ConnectRunOverlay } from "@/features/connection/ConnectRunOverlay";
import { openConnectWindow, EV_TESTED } from "@/lib/connect-window";
import { ipc, isTauri, type ConnectionProfile, type DriverInfo, type ServerInfo } from "@/lib/ipc";

type Draft = Omit<ConnectionProfile, "id"> & { id?: string };
type Tab = "connection" | "properties";

const SSL_MODES = [
  { value: "preferred", label: "Preferred", hint: "Encrypt if the server supports it" },
  { value: "required", label: "Required", hint: "Always encrypt (recommended for Exasol 8)" },
  { value: "verify_ca", label: "Verify CA", hint: "Encrypt and verify the CA certificate" },
  { value: "verify_identity", label: "Verify identity", hint: "Verify CA and host name" },
  { value: "disabled", label: "Disabled", hint: "No encryption — local test only" },
];

function emptyDraft(): Draft {
  return {
    // The default draft IS the local database, so name it that way up front —
    // a real value in the box, not placeholder text. Typing replaces it; we
    // never overwrite what the user sees.
    name: "Exasol Personal (local)",
    host: "localhost",
    port: 8563,
    username: "sys",
    password: "",
    schema: "",
    notes: "",
    sslMode: "required",
    compression: false,
    driverId: "sqlx-exasol",
  };
}

function defineConnThemes(monaco: Monaco) {
  monaco.editor.defineTheme("exasol-conn-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "82dd4b" },
      { token: "string", foreground: "e9a94f" },
      { token: "comment", foreground: "6a6a70", fontStyle: "italic" },
    ],
    colors: { "editor.background": "#0a0a0b", "editor.foreground": "#ededee" },
  });
  monaco.editor.defineTheme("exasol-conn-light", {
    base: "vs",
    inherit: true,
    rules: [{ token: "comment", foreground: "6b7280", fontStyle: "italic" }],
    colors: { "editor.background": "#ffffff", "editor.foreground": "#0b1730" },
  });
}

function buildDsn(draft: Draft): string {
  const params: string[] = [];
  if (draft.sslMode !== "preferred") params.push(`ssl-mode=${draft.sslMode}`);
  if (draft.compression) params.push("compression=enabled");
  if (draft.schema?.trim()) params.push(`schema=${draft.schema.trim()}`);
  const query = params.length ? `?${params.join("&")}` : "";
  const pass = draft.password ? "••••••" : "";
  return `; Live connection URL (native driver)
url        = exa://${draft.username || "user"}:${pass}@${draft.host || "host"}:${draft.port}${query}

; Resolved settings
driver     = ${draft.driverId}
encryption = ${draft.sslMode}
compression= ${draft.compression ? "enabled" : "off"}
schema     = ${draft.schema?.trim() || "(session default)"}`;
}

export function ConnectView({
  drivers,
  profiles,
  onSaved,
  onConnected,
}: {
  drivers: DriverInfo[];
  profiles: ConnectionProfile[];
  onSaved: () => void | Promise<void>;
  onConnected: (profile: ConnectionProfile, server: ServerInfo) => void | Promise<void>;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [tab, setTab] = useState<Tab>("connection");
  const [showPassword, setShowPassword] = useState(false);
  const [recentHidden, setRecentHidden] = useState(
    () => window.localStorage.getItem("exasol-recent-hidden") === "1",
  );
  const [overlay, setOverlay] = useState<{ open: boolean; mode: "test" | "connect"; runId: number }>({
    open: false,
    mode: "test",
    runId: 0,
  });
  // Last test outcome, so the Test button can show a ✓ / ✗.
  const [testing, setTesting] = useState(false);
  const [testedOk, setTestedOk] = useState<boolean | null>(null);

  // The separate native window reports its test result back via this event.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ ok: boolean }>(EV_TESTED, (e) => {
        setTesting(false);
        setTestedOk(e.payload.ok);
      });
    })();
    return () => unlisten?.();
  }, []);

  function toggleRecent() {
    setRecentHidden((h) => {
      window.localStorage.setItem("exasol-recent-hidden", h ? "0" : "1");
      return !h;
    });
  }

  const dsn = useMemo(() => buildDsn(draft), [draft]);
  const selectedDriver = drivers.find((d) => d.id === draft.driverId);
  const canRun = Boolean(draft.host.trim() && draft.username.trim());

  // Runtime readiness for the chosen driver (non-native drivers need a runtime
  // installed on demand — nothing is bundled).
  const [driverStat, setDriverStat] = useState<{ ready: boolean; supported: boolean; hint: string } | null>(null);
  const [installingDriver, setInstallingDriver] = useState(false);
  useEffect(() => {
    let alive = true;
    ipc
      .driverStatus(draft.driverId)
      .then((s) => alive && setDriverStat({ ready: s.ready, supported: s.supported, hint: s.hint }))
      .catch(() => alive && setDriverStat(null));
    return () => {
      alive = false;
    };
  }, [draft.driverId]);
  async function installDriverRuntime() {
    setInstallingDriver(true);
    try {
      await ipc.driverSetup(draft.driverId);
      const s = await ipc.driverStatus(draft.driverId);
      setDriverStat({ ready: s.ready, supported: s.supported, hint: s.hint });
    } catch {
      /* surfaced on next execute */
    } finally {
      setInstallingDriver(false);
    }
  }

  const patch = (partial: Partial<Draft>) => {
    setDraft((c) => ({ ...c, ...partial }));
    setTestedOk(null); // settings changed → previous test no longer valid
  };

  // Prefer a real separate OS window; fall back to the in-app floating window
  // (browser preview, or if window creation is unavailable).
  async function launch(mode: "test" | "connect") {
    if (mode === "test") {
      setTesting(true);
      setTestedOk(null);
    }
    const opened = await openConnectWindow({ draft, mode });
    if (!opened) setOverlay((o) => ({ open: true, mode, runId: o.runId + 1 }));
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-editor">
      {/* Header — title + actions on row 1, tabs on row 2 */}
      <div className="shrink-0 border-b border-border">
        <div className="flex h-11 items-center px-3">
          <Plug className="mr-2 h-4 w-4 text-primary" />
          <span className="font-heading text-[14px] font-bold text-foreground">
            Connect to database
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canRun || testing}
              onClick={() => launch("test")}
              className={cn(
                testedOk === true && "border-primary/50 text-primary",
                testedOk === false && "border-destructive/50 text-destructive",
              )}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testedOk === true ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              ) : testedOk === false ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {testing ? "Testing…" : testedOk === true ? "Tested" : "Test connection"}
            </Button>
            <Button size="sm" className="cta-glow" data-agent-id="connect.submit" disabled={!canRun} onClick={() => launch("connect")}>
              <PlugZap className="h-3.5 w-3.5" />
              Connect
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex h-9 items-center gap-1 border-t border-border px-3">
          {(["connection", "properties"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex h-8 items-center border-b-2 px-3 text-[13px] font-medium capitalize transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="64%" minSize="140px" className="min-h-0">
          <div className="h-full overflow-y-auto p-5">
            {profiles.length > 0 ? (
              <div className="mb-5 max-w-2xl">
                <div className="flex items-center justify-between">
                  <span className="eyebrow-muted">Recent connections</span>
                  <button
                    onClick={toggleRecent}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {recentHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {recentHidden ? "Show" : "Hide"}
                  </button>
                </div>
                {recentHidden ? null : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => setDraft({ ...profile })}
                      title="Click to fill the form with these details"
                      className="group flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
                    >
                      <Database className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[13px] font-medium text-foreground">{profile.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {profile.host}:{profile.port}
                      </span>
                    </button>
                  ))}
                </div>
                )}
              </div>
            ) : null}

            {tab === "connection" ? (
              <div className="grid max-w-2xl gap-4">
                <Field label="Connection name" optional>
                  <Input
                    data-agent-id="connect.name"
                    placeholder={draft.username && draft.host ? `${draft.username}@${draft.host}` : "Local Exasol"}
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <Field label="Host">
                    <Input data-agent-id="connect.host" value={draft.host} onChange={(e) => patch({ host: e.target.value })} />
                  </Field>
                  <Field label="Port">
                    <Input
                      inputMode="numeric"
                      value={draft.port}
                      onChange={(e) => patch({ port: Number(e.target.value) || 8563 })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Username">
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input data-agent-id="connect.username" className="pl-8" value={draft.username} onChange={(e) => patch({ username: e.target.value })} />
                    </div>
                  </Field>
                  <Field label="Password">
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        data-agent-id="connect.password"
                        className="pl-8 pr-9"
                        type={showPassword ? "text" : "password"}
                        value={draft.password}
                        onChange={(e) => patch({ password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Driver">
                    <Select value={draft.driverId} onValueChange={(v) => patch({ driverId: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name}
                            {driver.isDefault ? " · default" : ""}
                            {driver.kind !== "native" ? " (external)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Initial schema" optional>
                    <Input
                      placeholder="STARTER_KIT"
                      value={draft.schema ?? ""}
                      onChange={(e) => patch({ schema: e.target.value })}
                    />
                  </Field>
                </div>
                {selectedDriver ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedDriver.name} — {selectedDriver.protocol}. {selectedDriver.description}
                    {selectedDriver.kind !== "native"
                      ? " Browsing & metadata use the native protocol; queries you run execute through this driver's runtime."
                      : ""}
                  </p>
                ) : null}

                {/* Non-native driver: show runtime readiness + install-on-demand. */}
                {selectedDriver && selectedDriver.kind !== "native" && driverStat && !driverStat.ready ? (
                  driverStat.supported ? (
                    <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                      <span className="flex-1">This driver's runtime isn't installed yet. Install it once to run queries over {selectedDriver.name}.</span>
                      <Button size="sm" variant="secondary" onClick={installDriverRuntime} disabled={installingDriver}>
                        {installingDriver ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                        Install runtime
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                      {driverStat.hint}
                    </div>
                  )
                ) : null}
                {selectedDriver && selectedDriver.kind !== "native" && driverStat?.ready ? (
                  <p className="flex items-center gap-1.5 text-xs text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {selectedDriver.name} runtime ready.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid max-w-2xl gap-4">
                <Field label="Notes" optional>
                  <Textarea
                    rows={4}
                    placeholder="What this connection is for, credentials owner, environment…"
                    value={draft.notes ?? ""}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Encryption">
                    <Select value={draft.sslMode} onValueChange={(v) => patch({ sslMode: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SSL_MODES.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Compression">
                    <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                      <Switch checked={draft.compression} onCheckedChange={(c) => patch({ compression: c === true })} />
                      {draft.compression ? "Enabled" : "Off"}
                    </label>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  {SSL_MODES.find((m) => m.value === draft.sslMode)?.hint}
                </p>
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle groupDirection="vertical" />
        <ResizablePanel defaultSize="36%" minSize="80px" maxSize="72%" className="min-h-0">
          <div className="flex h-full min-h-0 flex-col border-t border-border">
            <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3">
              <Plug className="h-3.5 w-3.5 text-primary" />
              <span className="eyebrow-muted">Connection URL</span>
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                beforeMount={defineConnThemes}
                language="ini"
                theme={theme === "dark" ? "exasol-conn-dark" : "exasol-conn-light"}
                value={dsn}
                height="100%"
                options={{
                  readOnly: true,
                  automaticLayout: true,
                  fontFamily: "JetBrains Mono",
                  fontSize: 12,
                  minimap: { enabled: false },
                  lineNumbers: "off",
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  renderLineHighlight: "none",
                  folding: false,
                }}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ConnectRunOverlay
        key={overlay.runId}
        open={overlay.open}
        mode={overlay.mode}
        draft={draft}
        onClose={() => setOverlay((o) => ({ ...o, open: false }))}
        onSaved={onSaved}
        onConnected={onConnected}
        onDone={(status) => {
          setTesting(false);
          if (overlay.mode === "test") setTestedOk(status === "ok");
        }}
      />
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {optional ? <span className="text-[10px] text-muted-foreground/60">optional</span> : null}
      </span>
      {children}
    </label>
  );
}
