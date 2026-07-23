import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Square,
  Terminal,
  Zap,
  type LucideIcon,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AgentMark } from "@/components/studio/AgentMark";
import { ProviderMark, ModelBadges } from "@/features/assistant/provider-marks";
import { Icon as BxIcon } from "@/components/ui/icon";

/** Brain-circuit (Boxicons) with a lucide-compatible signature for SECTIONS. */
const BrainCircuit = ({ className }: { className?: string }) => <BxIcon name="brain-circuit" className={className} />;
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PET_AVATARS, PetAvatar } from "@/components/studio/PetAvatar";
import { skills as skillsApi, type Skill } from "@/lib/agent-client";
import {
  agent,
  llm,
  type AgentProviderInfo,
  type AgentSettings,
  type LlmProgress,
  type LlmStatus,
} from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED } from "@/lib/ai-window";
import { exportTraces, importTraces, traceStats } from "@/lib/ui-trace";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const CLOUD_META: Record<string, { hint: string; keyUrl: string }> = {
  anthropic: { hint: "Claude models", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { hint: "GPT models", keyUrl: "https://platform.openai.com/api-keys" },
  google: { hint: "Gemini models", keyUrl: "https://aistudio.google.com/apikey" },
  groq: { hint: "Fast Llama/Kimi/GPT-OSS inference", keyUrl: "https://console.groq.com/keys" },
  openrouter: { hint: "One key, many models", keyUrl: "https://openrouter.ai/keys" },
};

type SectionKey = "providers" | "guardrails" | "behavior" | "skills";

const SECTIONS: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: "providers", label: "Providers & Models", icon: BrainCircuit, desc: "Built-in engine, local runtimes, API keys" },
  { key: "guardrails", label: "Guardrails", icon: ShieldCheck, desc: "What the AI may and may not do" },
  { key: "behavior", label: "Behavior", icon: SlidersHorizontal, desc: "Steps, temperature, instructions" },
  { key: "skills", label: "Skills", icon: Sparkles, desc: "Reusable instruction packs for the agent" },
];

/** AI Settings: sidebar + sections. Renders as a standalone native window
 *  (title bar + h-screen) or embedded as a workspace tab (standalone=false). */
export function AiProvidersWindow({ standalone = true }: { standalone?: boolean } = {}) {
  const [section, setSection] = useState<SectionKey>("providers");
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [llmState, setLlmState] = useState<LlmStatus | null>(null);
  const [progress, setProgress] = useState<LlmProgress | null>(null);
  const [busyLlm, setBusyLlm] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState<string>("");
  const [defaultModel, setDefaultModel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { providers: list, defaultModel: dm } = await agent.models();
      setProviders(list);
      setDefaultModel(dm);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const refreshLlm = useCallback(async () => {
    try {
      setLlmState(await llm.status());
    } catch {
      setLlmState(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshLlm();
    agent
      .getSettings()
      .then(({ settings: s }) => {
        setSettings(s);
        setInstructionsDraft(s.customInstructions);
      })
      .catch(() => undefined);
    const un = llm.onProgress((p) => setProgress(p));
    return () => void un.then((f) => f());
  }, [refresh, refreshLlm]);

  async function llmAction(key: string, fn: () => Promise<unknown>) {
    setBusyLlm(key);
    setProgress(null);
    try {
      await fn();
      await refreshLlm();
      await refresh();
      await emit(EV_AI_PROVIDERS_CHANGED);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyLlm(null);
      setProgress(null);
    }
  }

  async function saveKey(providerId: string) {
    const key = drafts[providerId]?.trim();
    if (!key) return;
    setSaving(providerId);
    try {
      await agent.setProviderKey(providerId, key);
      setDrafts((d) => ({ ...d, [providerId]: "" }));
      await refresh();
      await emit(EV_AI_PROVIDERS_CHANGED);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function patchSettings(patch: Partial<AgentSettings>) {
    try {
      const next = await agent.setSettings(patch);
      setSettings(next);
      // Other windows (pet, panel) react immediately.
      await emit(EV_AI_PROVIDERS_CHANGED);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const locals = providers.filter((p) => p.kind === "local" && p.id !== "builtin");
  const clouds = providers.filter((p) => p.kind === "cloud" && CLOUD_META[p.id]);

  const activeSection = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];
  const ActiveIcon = activeSection.icon;
  return (
    <div className={cn("flex flex-col bg-editor text-foreground", standalone ? "h-screen" : "h-full")}>
      {/* Title bar (draggable only as a native window) */}
      <div data-tauri-drag-region={standalone || undefined} className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <AgentMark className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold tracking-tight">AI Settings</span>
        <button
          onClick={() => {
            void refresh();
            void refreshLlm();
          }}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Refresh"
          title="Re-detect providers and models"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar: names only. Descriptions live in the section header. ── */}
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-border bg-panel/30 px-2.5 py-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Settings
          </p>
          <div className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-md py-1.5 pl-3 pr-2 text-left text-[12.5px] transition-colors",
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                  ) : null}
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground/80")} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Content ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-8 py-7">
            {/* Section header — the description belongs here, not crammed into the rail. */}
            <header className="mb-6 flex items-start gap-3 border-b border-border pb-5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ActiveIcon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h1 className="font-heading text-[17px] font-semibold tracking-tight text-foreground">{activeSection.label}</h1>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{activeSection.desc}</p>
              </div>
            </header>

            {error ? (
              <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-6">
            {section === "providers" ? (
              <ProvidersSection
                llmState={llmState}
                progress={progress}
                busyLlm={busyLlm}
                llmAction={llmAction}
                locals={locals}
                clouds={clouds}
                drafts={drafts}
                setDrafts={setDrafts}
                saving={saving}
                saveKey={saveKey}
                inDb={providers.find((p) => p.id === "in-database")}
                settings={settings}
                patchSettings={patchSettings}
                defaultModel={defaultModel}
                onSetDefaultModel={async (m) => {
                  await agent.setDefaultModel(m);
                  setDefaultModel(m);
                  await emit(EV_AI_PROVIDERS_CHANGED);
                }}
                onChanged={async () => {
                  await refresh();
                  await emit(EV_AI_PROVIDERS_CHANGED);
                }}
              />
            ) : null}
            {section === "providers" ? <CliCard /> : null}
            {section === "guardrails" ? (
              <GuardrailsSection settings={settings} patch={patchSettings} />
            ) : section === "skills" ? (
              <SkillsSection />
            ) : section === "behavior" ? (
              <BehaviorSection
                settings={settings}
                patch={patchSettings}
                instructionsDraft={instructionsDraft}
                setInstructionsDraft={setInstructionsDraft}
              />
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Providers ────────────────────────── */

function ProvidersSection(props: {
  llmState: LlmStatus | null;
  progress: LlmProgress | null;
  busyLlm: string | null;
  llmAction: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  locals: AgentProviderInfo[];
  clouds: AgentProviderInfo[];
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: string | null;
  saveKey: (id: string) => Promise<void>;
  inDb?: AgentProviderInfo;
  settings: AgentSettings | null;
  patchSettings: (patch: Partial<AgentSettings>) => Promise<void>;
  defaultModel: string | null;
  onSetDefaultModel: (model: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { llmState, progress, busyLlm, llmAction, locals, clouds, drafts, setDrafts, saving, saveKey, inDb, settings, patchSettings, defaultModel, onSetDefaultModel, onChanged } = props;
  // Horizontal sub-tabs: one source group at a time instead of a long scroll.
  const [srcTab, setSrcTab] = useState<"builtin" | "local" | "cloud" | "indb">("builtin");
  const tab = srcTab === "builtin" && llmState && !llmState.supported ? "local" : srcTab;
  const TABS: { key: typeof srcTab; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { key: "builtin", label: "Built-in AI", icon: Zap, show: Boolean(llmState?.supported) },
    { key: "local", label: "Local runtimes", icon: Cpu, show: true },
    { key: "cloud", label: "Cloud APIs", icon: Globe, show: true },
    { key: "indb", label: "In-database", icon: Database, show: true },
  ];
  return (
    <>
      {/* ── Source tabs ── */}
      <div className="flex items-center gap-0.5 border-b border-border">
        {TABS.filter((t) => t.show).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSrcTab(t.key)}
              className={cn(
                "flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-[12px] transition-colors",
                active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "builtin" ? (
      <>
      {llmState?.supported ? (
        <section>
          <div className="mb-1 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-[13px] font-semibold">Built-in local AI</h2>
            <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">
              recommended
            </span>
            {llmState.runningModel ? (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> running
              </span>
            ) : null}
          </div>
          <p className="mb-2.5 text-[11.5px] text-muted-foreground">
            No extra installs — Exasol Studio runs the model for you, fully offline.
          </p>
          {!llmState.engineInstalled ? (
            <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[12.5px] font-medium">AI engine</div>
                  <div className="text-[11px] text-muted-foreground">
                    One-time ~15 MB download (llama.cpp, official build for this machine).
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={busyLlm !== null}
                  onClick={() => void llmAction("engine", () => llm.installEngine())}
                >
                  {busyLlm === "engine" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  <span className="ml-1">Install engine</span>
                </Button>
              </div>
              {busyLlm === "engine" && progress ? <LlmProgressBar p={progress} /> : null}
            </div>
          ) : (
            <div className="space-y-2">
              {llmState.models.map((m) => {
                const active = llmState.runningModel === m.id;
                const busyKey = `model:${m.id}`;
                const isBusy = busyLlm === busyKey;
                return (
                  <div key={m.id} className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                          {m.name}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {(m.sizeMb / 1024).toFixed(1)} GB · needs {m.minRamGb} GB RAM
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{m.description}</div>
                      </div>
                      {active ? (
                        <button
                          onClick={() => void llmAction(busyKey, () => llm.stop())}
                          disabled={busyLlm !== null}
                          className="flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                        >
                          <Square className="h-3 w-3" /> Stop
                        </button>
                      ) : m.downloaded ? (
                        <button
                          onClick={() => void llmAction(busyKey, () => llm.start(m.id))}
                          disabled={busyLlm !== null}
                          className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Use
                        </button>
                      ) : (
                        <button
                          onClick={() => void llmAction(busyKey, () => llm.installModel(m.id))}
                          disabled={busyLlm !== null}
                          className="flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Download
                        </button>
                      )}
                    </div>
                    {isBusy && progress ? <LlmProgressBar p={progress} /> : null}
                  </div>
                );
              })}
              {/* Embeddings ride along automatically with the local runtime —
                  shown as passive status, never a separate choice. */}
              {llmState.runningModel ? (
                <p className="px-1 text-[10.5px] text-muted-foreground">
                  {llmState.embeddingReady
                    ? "Memory, skills & session search running fully on-device."
                    : busyLlm === "embed" || progress?.stage === "embed"
                      ? "Setting up on-device memory (21 MB, one time)…"
                      : "On-device memory will finish setting up shortly."}
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      </>
      ) : null}

      {tab === "local" ? (
      <section>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Free, private, and offline — detected automatically on this machine.
        </p>
        <div className="divide-y divide-border/60">
          {(locals.length
            ? locals
            : [{ id: "ollama", name: "Ollama (local)", kind: "local", configured: false, models: [] } as AgentProviderInfo]
          ).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 py-3 first:pt-0">
              <ProviderMark providerId={p.id} className="h-5 w-5 shrink-0 text-foreground" />
              <span className={cn("h-2 w-2 shrink-0 rounded-full", p.running ? "bg-primary" : "bg-muted-foreground/40")} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium">{p.name.replace(" (local)", "")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.running
                    ? `Running — ${p.models.length} model${p.models.length === 1 ? "" : "s"} available`
                    : p.installedOnly
                      ? "Installed but not running — start it with `ollama serve`"
                      : p.id === "ollama"
                        ? "Not detected — install from ollama.com"
                        : "Not detected"}
                </div>
              </div>
              {p.running ? (
                <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">ready</span>
              ) : p.id === "ollama" && !p.installedOnly ? (
                <button
                  onClick={() => void ipc.openExternal("https://ollama.com")}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Get <ExternalLink className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      ) : null}

      {tab === "cloud" ? (
      <section>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Keys are stored locally on this machine and used only for your requests. Pick the model in the chat's model
          dropdown — and check your account's usage and rate limits on the provider's console: free tiers often can't
          fit the full agent.
        </p>
        <div className="divide-y divide-border/60">
          {clouds.map((p) => {
            const meta = CLOUD_META[p.id];
            return (
              <div key={p.id} className="py-3 first:pt-0">
                <div className="flex items-center gap-1.5">
                  <ProviderMark providerId={p.id} className="h-4.5 w-4.5 shrink-0 text-foreground" />
                  <span className="text-[12.5px] font-medium">{p.name}</span>
                  <span className="text-[10.5px] text-muted-foreground">· {p.configured && p.models.length ? `${p.models.length} models live` : meta.hint}</span>
                  {p.configured ? (
                    <span className="ml-auto flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">
                      <Check className="h-2.5 w-2.5" /> connected
                    </span>
                  ) : (
                    <button
                      onClick={() => void ipc.openExternal(meta.keyUrl)}
                      className="ml-auto flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                    >
                      Get a key <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Input
                    type="password"
                    placeholder={p.configured ? "•••• saved — enter to replace" : "Paste API key…"}
                    value={drafts[p.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveKey(p.id);
                    }}
                    className="h-9 flex-1 rounded-lg text-[12.5px]"
                  />
                  <Button size="sm" className="h-9 px-4" disabled={!drafts[p.id]?.trim() || saving === p.id} onClick={() => void saveKey(p.id)}>
                    {saving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      ) : null}

      {tab === "indb" ? <InDatabaseSection provider={inDb} onChanged={onChanged} /> : null}
    </>
  );
}

/* ───────────────────── In-Database / Enterprise AI ───────────────────── */

function InDatabaseSection({
  provider,
  onChanged,
}: {
  provider?: AgentProviderInfo;
  onChanged: () => Promise<void>;
}) {
  const configured = Boolean(provider?.configured);
  const [baseURL, setBaseURL] = useState("");
  const [modelId, setModelId] = useState(provider?.models[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function test() {
    const url = baseURL.trim();
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await agent.probeEndpoint(url, apiKey.trim() || undefined);
      setTestResult(
        r.ok
          ? { ok: true, msg: `Reachable — ${r.models ?? 0} model${r.models === 1 ? "" : "s"} advertised.` }
          : { ok: false, msg: r.error ?? "Could not reach the endpoint." },
      );
    } catch (e) {
      setTestResult({ ok: false, msg: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  }

  function copy(cmd: string) {
    void navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
  }

  async function save() {
    const url = baseURL.trim();
    const mid = modelId.trim();
    if (!url || !mid) return;
    setSaving(true);
    try {
      await agent.setProvider("in-database", {
        baseURL: url,
        apiKey: apiKey.trim() || undefined,
        models: [{ id: mid, name: mid }],
      });
      setBaseURL("");
      setApiKey("");
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[13px] font-semibold">In-Database / Enterprise AI</h2>
        {configured ? (
          <span className="ml-auto flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">
            <Check className="h-2.5 w-2.5" /> connected
          </span>
        ) : null}
      </div>
      <p className="mb-2.5 text-[11.5px] text-muted-foreground">
        Use your own LLM served on the cluster or a private gateway (vLLM, TGI, Ollama, any OpenAI-compatible endpoint).
        Data and prompts stay inside your infrastructure.
      </p>

      <div className="space-y-2 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
        {configured && provider?.models[0] ? (
          <div className="text-[11px] text-muted-foreground">
            Current: <span className="font-mono text-foreground">{provider.models[0].id}</span> — pick it in the model list. Re-enter below to change.
          </div>
        ) : null}
        <label className="block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Endpoint URL</label>
        <Input
          placeholder="https://ai.your-company.internal/v1"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          className="h-7 text-xs"
        />
        <label className="block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Model ID</label>
        <Input
          placeholder="e.g. llama-3.3-70b-instruct"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="h-7 text-xs"
        />
        <label className="block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">API key (optional)</label>
        <Input
          type="password"
          placeholder="Only if your endpoint requires one"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="h-7 text-xs"
        />
        {testResult ? (
          <div className={cn("flex items-center gap-1.5 text-[11px]", testResult.ok ? "text-primary" : "text-destructive")}>
            {testResult.ok ? <Check className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {testResult.msg}
          </div>
        ) : null}
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!baseURL.trim() || testing}
            onClick={() => void test()}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test connection"}
          </Button>
          <Button size="sm" className="h-7" disabled={!baseURL.trim() || !modelId.trim() || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save endpoint"}
          </Button>
        </div>
      </div>

      <button
        onClick={() => setShowGuide((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        {showGuide ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        How to set up AI inside Exasol
      </button>
      {showGuide ? (
        <div className="mt-1.5 space-y-2 rounded-lg border border-border bg-editor px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <p className="text-foreground">Two ways to run AI on your Exasol infrastructure:</p>
          <div>
            <p className="font-medium text-foreground">1 · Serve your own LLM for this chat (recommended)</p>
            <p>
              Run an OpenAI-compatible server (vLLM, TGI, or Ollama) on a cluster node or a gateway host that can use the
              cluster's GPUs/RAM. Point the endpoint above at its <span className="font-mono">/v1</span> URL. This gives the
              agent full streaming + tool-calling, entirely within your network. No database privileges needed.
            </p>
            {[
              { label: "Ollama (simplest)", cmd: "ollama serve   # → http://localhost:11434/v1" },
              { label: "vLLM (GPU, production)", cmd: "vllm serve meta-llama/Llama-3.3-70B-Instruct --port 8000   # → http://<host>:8000/v1" },
            ].map((c) => (
              <div key={c.label} className="mt-1">
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-panel/60 px-2 py-1">
                  <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[10.5px] text-foreground">{c.cmd}</code>
                  <button onClick={() => copy(c.cmd)} className="shrink-0 text-[10px] text-primary hover:underline">
                    {copied === c.cmd ? "copied" : "copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <p className="font-medium text-foreground">2 · In-database inference (Transformers Extension)</p>
            <p>
              For embeddings, classification, and batch text generation that run <em>as UDFs across every cluster node in
              parallel</em>: install the Transformers Extension, upload the model to BucketFS, and call it from SQL. Best for
              scoring millions of rows in-place — not for interactive chat (UDF calls aren't low-latency streaming).
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button onClick={() => void ipc.openExternal("https://github.com/exasol/transformers-extension")} className="flex items-center gap-1 text-primary hover:underline">
                Transformers Extension <ExternalLink className="h-2.5 w-2.5" />
              </button>
              <button onClick={() => void ipc.openExternal("https://github.com/exasol/ai-lab")} className="flex items-center gap-1 text-primary hover:underline">
                Exasol AI Lab <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ────────────────────────── Guardrails ────────────────────────── */

function GuardrailsSection({
  settings,
  patch,
}: {
  settings: AgentSettings | null;
  patch: (p: Partial<AgentSettings>) => Promise<void>;
}) {
  if (!settings) return <p className="text-[12px] text-muted-foreground">Loading…</p>;
  return (
    <>
      <section>
        <div className="mb-1 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[13px] font-semibold">Database access</h2>
        </div>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          What the AI may run against your connected databases. These rules are enforced in the agent, not just suggested to the model.
        </p>
        <div className="space-y-2">
          <ChoiceRow
            label="Read queries (SELECT)"
            desc="Row-capped; results feed the answer."
            value={settings.readPolicy}
            options={[
              { value: "allow", label: "Run automatically" },
              { value: "ask", label: "Ask me first" },
            ]}
            onChange={(v) => void patch({ readPolicy: v as AgentSettings["readPolicy"] })}
          />
          <ChoiceRow
            label="Write statements (INSERT / UPDATE / DDL)"
            desc="Shown with the exact SQL before anything runs."
            value={settings.writePolicy}
            options={[
              { value: "ask", label: "Ask me first" },
              { value: "deny", label: "Never allow" },
            ]}
            onChange={(v) => void patch({ writePolicy: v as AgentSettings["writePolicy"] })}
          />
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[13px] font-semibold">Pet & app control</h2>
          <span className="rounded bg-syntax-function/15 px-1.5 py-px text-[9px] font-medium uppercase text-syntax-function">beta</span>
        </div>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Let the AI operate the app for you (connect, open views, prepare SQL) by driving the real UI. This is a beta
          capability and is <span className="font-medium text-foreground">off by default</span> — turn it on to allow it.
        </p>
        <div className="space-y-2">
          <ToggleRow
            label="Graphical UI actions (beta)"
            desc="Master switch: allow the agent to click and drive the app. When off, the AI answers and prepares SQL but never touches the UI."
            checked={settings.enableUiTools}
            onChange={(v) => void patch({ enableUiTools: v })}
          />
          <div className={cn("space-y-2 transition-opacity", settings.enableUiTools ? "" : "pointer-events-none opacity-50")}>
          <ChoiceRow
            label="When the AI acts in the app"
            desc="Pet: a companion + cursor perform actions visibly. Cursor: just the cursor. Off: actions run silently."
            value={settings.petMode}
            options={[
              { value: "pet", label: "Pet companion" },
              { value: "cursor", label: "Cursor only" },
              { value: "off", label: "Off — background" },
            ]}
            onChange={(v) => void patch({ petMode: v as AgentSettings["petMode"] })}
          />
          <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
            <div className="text-[12.5px] font-medium">Companion</div>
            <div className="text-[11px] text-muted-foreground">Pick who does the walking.</div>
            <div className="mt-2 flex gap-2">
              {PET_AVATARS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void patch({ petAvatar: a.id })}
                  title={a.name}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border p-1.5 transition-colors",
                    settings.petAvatar === a.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  <PetAvatar avatar={a.id} expression={settings.petAvatar === a.id ? "happy" : "idle"} className="h-9 w-9" />
                  <span className="text-[9.5px] text-muted-foreground">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="Allow destructive app actions"
            desc="Disconnecting, deleting, dropping via UI control. Keep off unless you need it."
            checked={settings.allowDestructiveUi}
            onChange={(v) => void patch({ allowDestructiveUi: v })}
          />
          <ToggleRow
            label="Allow file access"
            desc="Reading and editing workspace files. Off by default."
            checked={settings.allowFileAccess}
            onChange={(v) => void patch({ allowFileAccess: v })}
          />
          <ToggleRow
            label="Auto-commit workspace to git"
            desc="After each agent turn, commit changes in your ~/ExasolStudio folder to git so every AI change is tracked and reversible."
            checked={settings.autoCommit}
            onChange={(v) => void patch({ autoCommit: v })}
          />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13px] font-semibold">Navigation knowledge</h2>
        <p className="mb-2 text-[11.5px] text-muted-foreground">
          The app learns routes from real usage ({traceStats().transitions} transitions, {traceStats().interactions}{" "}
          interactions). Export to share a base pack; import merges without losing local learning.
        </p>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => void navigator.clipboard.writeText(exportTraces())}
          >
            Export to clipboard
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              const json = window.prompt("Paste a trace pack (JSON):");
              if (!json) return;
              try {
                const n = importTraces(json);
                window.alert(`Imported ${n} transitions.`);
              } catch (e) {
                window.alert(String(e));
              }
            }}
          >
            Import…
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13px] font-semibold">Capabilities</h2>
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
            <div className="text-[12.5px] font-medium">Default method</div>
            <div className="text-[11px] text-muted-foreground">
              {settings.defaultSkills.includes("fable-method") ? "Fable Method · evidence → action → verification" : "Workspace default"}
            </div>
          </div>
          <ToggleRow
            label="Parallel researchers"
            desc="Read-only sub-agents that fan out for broad exploration."
            checked={settings.enableResearcher}
            onChange={(v) => void patch({ enableResearcher: v })}
          />
          <ToggleRow
            label="Cross-session insights"
            desc="Save verified schema facts and reuse them in future chats."
            checked={settings.enableInsights}
            onChange={(v) => void patch({ enableInsights: v })}
          />
          <ToggleRow
            label="Auto-compaction"
            desc="Summarize older turns near the context limit so long chats keep going."
            checked={settings.enableCompaction}
            onChange={(v) => void patch({ enableCompaction: v })}
          />
        </div>
      </section>
    </>
  );
}

/* ────────────────────────── Behavior ────────────────────────── */

function BehaviorSection({
  settings,
  patch,
  instructionsDraft,
  setInstructionsDraft,
}: {
  settings: AgentSettings | null;
  patch: (p: Partial<AgentSettings>) => Promise<void>;
  instructionsDraft: string;
  setInstructionsDraft: (v: string) => void;
}) {
  if (!settings) return <p className="text-[12px] text-muted-foreground">Loading…</p>;
  return (
    <>
      <section>
        <div className="mb-1 flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[13px] font-semibold">Loop</h2>
        </div>
        <div className="space-y-2">
          <NumberRow
            label="Max tool steps per turn"
            desc="How many tool calls a single answer may chain (2–24)."
            value={settings.maxSteps}
            min={2}
            max={24}
            onChange={(v) => void patch({ maxSteps: v })}
          />
          <NumberRow
            label="Temperature"
            desc="0 = deterministic, 1 = creative. SQL work likes it low."
            value={settings.temperature}
            min={0}
            max={1}
            step={0.1}
            onChange={(v) => void patch({ temperature: v })}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13px] font-semibold">Workspace instructions</h2>
        <p className="mb-2 text-[11.5px] text-muted-foreground">
          Appended to the AI's system prompt in every chat — naming conventions, preferred schemas, house rules.
        </p>
        <textarea
          value={instructionsDraft}
          onChange={(e) => setInstructionsDraft(e.target.value)}
          rows={6}
          placeholder="e.g. Always use the ANALYTICS schema. Prefer views over tables. Currency is EUR."
          className="w-full resize-y rounded-lg border border-border bg-panel/60 px-3 py-2 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
        />
        <div className="mt-1.5 flex justify-end">
          <Button
            size="sm"
            className="h-7"
            disabled={instructionsDraft === settings.customInstructions}
            onClick={() => void patch({ customInstructions: instructionsDraft })}
          >
            Save instructions
          </Button>
        </div>
      </section>
    </>
  );
}

/* ────────────────────────── Controls ────────────────────────── */

function ChoiceRow({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <div className="text-[12.5px] font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{desc}</div>
      <div className="mt-2 flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-7 items-center rounded-md border px-2.5 text-[11.5px] transition-colors",
              value === o.value
                ? "border-primary/50 bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.min(Math.max(v, min), max));
        }}
        className="h-7 w-20 shrink-0 rounded-md border border-border bg-editor px-2 text-right font-mono text-[12px] outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
      />
    </div>
  );
}

function SkillsSection() {
  const [list, setList] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<{ name: string; description: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => skillsApi.list().then(setList).catch((e) => setErr(errorMessage(e)));
  useEffect(() => {
    void refresh();
  }, []);

  if (editing) {
    return (
      <section>
        <h2 className="mb-1 text-[13px] font-semibold">{editing.name ? "Edit skill" : "New skill"}</h2>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          A skill is an instruction pack the agent loads for a matching task. Give it a clear name and description; write the steps in the body (Markdown).
        </p>
        <div className="space-y-2">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="skill-name"
            className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12.5px] outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
          <input
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="One line — when should the agent use this?"
            className="h-8 w-full rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            rows={12}
            placeholder="# How to do X\n\nStep-by-step instructions the agent will follow…"
            className="w-full resize-y rounded-lg border border-border bg-editor px-2.5 py-2 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!editing.name.trim() || !editing.body.trim()}
            onClick={() => {
              void skillsApi
                .save(editing.name, editing.description, editing.body)
                .then(() => {
                  setEditing(null);
                  void refresh();
                })
                .catch((e) => setErr(errorMessage(e)));
            }}
          >
            Save skill
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[13px] font-semibold">Skills</h2>
        <Button
          size="sm"
          className="ml-auto h-7"
          onClick={() => setEditing({ name: "", description: "", body: "" })}
        >
          New skill
        </Button>
      </div>
      <p className="mb-2.5 text-[11.5px] text-muted-foreground">
        Reusable instruction packs the agent loads for matching tasks. Built-in ones ship with the app; add your own for your team's conventions.
      </p>
      {err ? <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px]">{err}</div> : null}
      <div className="space-y-2">
        {list.map((sk) => (
          <div key={sk.name} className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12.5px] font-medium text-foreground">{sk.name}</span>
              <span className={cn("rounded px-1.5 py-px text-[9px] font-medium uppercase", sk.source === "builtin" ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary")}>
                {sk.source}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  onClick={() => setEditing({ name: sk.name, description: sk.description, body: sk.body })}
                  className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {sk.source === "builtin" ? "Copy & edit" : "Edit"}
                </button>
                {sk.source === "user" ? (
                  <button
                    onClick={() => void skillsApi.remove(sk.name).then(refresh)}
                    className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sk.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LlmProgressBar({ p }: { p: LlmProgress }) {
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        {p.pct !== null ? (
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.pct}%` }} />
        ) : (
          <div className="relative h-full w-full overflow-hidden rounded-full">
            <span className="exa-indeterminate" />
          </div>
        )}
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">{p.msg}</div>
    </div>
  );
}

/** Install the exa-agent terminal command (same brain as the panel, in a shell). */
function CliCard() {
  const [state, setState] = useState<{ busy: boolean; path?: string; error?: string }>({ busy: false });
  return (
    <section className="mt-4 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-foreground">Terminal CLI</div>
            <div className="text-[11px] text-muted-foreground">
              Chat with Exa from any terminal — same models, memory and knowledge graph as this app.
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={state.busy}
          onClick={async () => {
            setState({ busy: true });
            try {
              const path = await ipc.installCli();
              setState({ busy: false, path });
            } catch (e) {
              setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
            }
          }}
        >
          {state.busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Install command
        </Button>
      </div>
      {state.path ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Installed to <code className="text-foreground">{state.path}</code> (PATH set up automatically). Open a{" "}
          <span className="text-foreground">new terminal</span> and run <code className="text-foreground">exa-agent</code>, then{" "}
          <code>/connect exa://user:pass@host:8563</code>.
        </div>
      ) : null}
      {state.error ? <div className="mt-2 text-[11px] text-destructive">{state.error}</div> : null}
    </section>
  );
}
