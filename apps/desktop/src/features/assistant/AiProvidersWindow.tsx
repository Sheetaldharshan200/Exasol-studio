import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  Check,
  Cpu,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AgentMark } from "@/components/studio/AgentMark";
import { PET_AVATARS, PetAvatar } from "@/components/studio/PetAvatar";
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
  openrouter: { hint: "One key, many models", keyUrl: "https://openrouter.ai/keys" },
};

type SectionKey = "providers" | "guardrails" | "behavior";

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon; desc: string }[] = [
  { key: "providers", label: "Providers & Models", icon: Cpu, desc: "Built-in engine, local runtimes, API keys" },
  { key: "guardrails", label: "Guardrails", icon: ShieldCheck, desc: "What the AI may and may not do" },
  { key: "behavior", label: "Behavior", icon: SlidersHorizontal, desc: "Steps, temperature, instructions" },
];

/** Standalone AI Settings window: sidebar + sections. */
export function AiProvidersWindow() {
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { providers: list } = await agent.models();
      setProviders(list);
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

  return (
    <div className="flex h-screen flex-col bg-editor text-foreground">
      {/* Title bar (draggable) */}
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <AgentMark className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold">AI Settings</span>
        <button
          onClick={() => {
            void refresh();
            void refreshLlm();
          }}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
          title="Re-detect"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ── */}
        <nav className="w-52 shrink-0 space-y-0.5 overflow-y-auto border-r border-border bg-panel/40 p-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active && "text-primary")} />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium">{s.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{s.desc}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Content ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl space-y-6 px-6 py-5">
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px]">
                {error}
              </div>
            ) : null}

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
              />
            ) : section === "guardrails" ? (
              <GuardrailsSection settings={settings} patch={patchSettings} />
            ) : (
              <BehaviorSection
                settings={settings}
                patch={patchSettings}
                instructionsDraft={instructionsDraft}
                setInstructionsDraft={setInstructionsDraft}
              />
            )}
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
}) {
  const { llmState, progress, busyLlm, llmAction, locals, clouds, drafts, setDrafts, saving, saveKey } = props;
  return (
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
            </div>
          )}
        </section>
      ) : null}

      <section>
        <div className="mb-1 flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[13px] font-semibold">Local runtimes</h2>
        </div>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Free, private, and offline — detected automatically on this machine.
        </p>
        <div className="space-y-2">
          {(locals.length
            ? locals
            : [{ id: "ollama", name: "Ollama (local)", kind: "local", configured: false, models: [] } as AgentProviderInfo]
          ).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
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

      <section>
        <h2 className="mb-1 text-[13px] font-semibold">External providers</h2>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Keys are stored locally on this machine and used only for your requests.
        </p>
        <div className="space-y-2.5">
          {clouds.map((p) => {
            const meta = CLOUD_META[p.id];
            return (
              <div key={p.id} className="rounded-lg border border-border bg-panel/60 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium">{p.name}</span>
                  <span className="text-[10.5px] text-muted-foreground">· {meta.hint}</span>
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
                    className="h-7 text-xs"
                  />
                  <Button size="sm" className="h-7" disabled={!drafts[p.id]?.trim() || saving === p.id} onClick={() => void saveKey(p.id)}>
                    {saving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
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
        </div>
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          The AI can operate the app for you (connect, open views, prepare SQL). Off by default — enable it here if you want the pet or cursor to click around; Off runs everything silently in the background.
        </p>
        <div className="space-y-2">
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
