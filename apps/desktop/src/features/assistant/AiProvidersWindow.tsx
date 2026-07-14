import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { Check, Cpu, ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentMark } from "@/components/studio/AgentMark";
import { agent, type AgentProviderInfo } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED } from "@/lib/ai-window";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const CLOUD_META: Record<string, { hint: string; keyUrl: string }> = {
  anthropic: { hint: "Claude models", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { hint: "GPT models", keyUrl: "https://platform.openai.com/api-keys" },
  google: { hint: "Gemini models", keyUrl: "https://aistudio.google.com/apikey" },
  openrouter: { hint: "One key, many models", keyUrl: "https://openrouter.ai/keys" },
};

/** Standalone floating window for local + external AI provider setup. */
export function AiProvidersWindow() {
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const locals = providers.filter((p) => p.kind === "local");
  const clouds = providers.filter((p) => p.kind === "cloud" && CLOUD_META[p.id]);

  return (
    <div className="flex h-screen flex-col bg-editor text-foreground">
      {/* Title bar (draggable) */}
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <AgentMark className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold">AI Providers</span>
        <button
          onClick={() => void refresh()}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
          title="Re-detect"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-6 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px]">
              {error}
            </div>
          ) : null}

          {/* ── Local models ── */}
          <section>
            <div className="mb-1 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-[13px] font-semibold">Local models</h2>
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
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      p.running ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
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
                    <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">
                      ready
                    </span>
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

          {/* ── External providers ── */}
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
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={!drafts[p.id]?.trim() || saving === p.id}
                        onClick={() => void saveKey(p.id)}
                      >
                        {saving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
