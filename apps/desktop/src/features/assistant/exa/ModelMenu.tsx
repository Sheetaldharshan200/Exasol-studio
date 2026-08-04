import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, KeyRound, Loader2, Search } from "lucide-react";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { ProviderMark, ModelBadges } from "@/features/assistant/provider-marks";
import { cn } from "@/lib/utils";

export type PickedModel = { providerID: string; modelID: string; label: string };

/**
 * The composer's inline model selector — continue.dev's ModelSelect grammar:
 * a compact trigger showing the current model, opening a grouped popover of
 * providers → models. A cloud provider's models are disclosed only after its
 * API key is set (opencode-style progressive disclosure); local runtimes and
 * the in-database endpoint list whatever they detect.
 */
export function ModelMenu({
  providers,
  model,
  onPick,
  onSaveKey,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPick: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function saveKey(providerId: string) {
    const key = (keyDraft[providerId] ?? "").trim();
    if (!key) return;
    setSavingKey(providerId);
    try {
      await onSaveKey(providerId, key);
      setKeyDraft((d) => ({ ...d, [providerId]: "" }));
    } finally {
      setSavingKey(null);
    }
  }

  const q = query.trim().toLowerCase();
  const label = model ? model.label : "Select model";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Model & providers"
        className="flex h-6 max-w-[220px] items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {model ? <ProviderMark providerId={model.providerID} className="h-3.5 w-3.5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 flex max-h-[380px] w-[300px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="relative shrink-0 border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 w-full bg-transparent pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
            {providers.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
                No providers yet. Run Ollama or LM Studio locally, or add a cloud API key below.
              </p>
            ) : null}
            {providers.map((p) => {
              const needsKey = p.kind === "cloud" && p.id !== "in-database" && !p.configured;
              const models = q ? p.models.filter((m) => (m.name || m.id).toLowerCase().includes(q)) : p.models;
              if (q && !needsKey && models.length === 0 && !p.name.toLowerCase().includes(q)) return null;
              return (
                <div key={p.id} className="px-1">
                  <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
                    <ProviderMark providerId={p.id} className="h-3 w-3" />
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</span>
                    {p.kind === "cloud" && p.id !== "in-database" ? (
                      <span className={cn("ml-auto flex items-center gap-1 text-[9.5px]", p.configured ? "text-primary" : "text-muted-foreground")}>
                        <KeyRound className="h-2.5 w-2.5" /> {p.configured ? "connected" : "key needed"}
                      </span>
                    ) : (
                      <span className="ml-auto text-[9.5px] text-muted-foreground">{p.installedOnly ? "not running" : p.running ? "running" : ""}</span>
                    )}
                  </div>
                  {needsKey ? (
                    <div className="flex items-center gap-1.5 px-2 pb-1.5">
                      <input
                        type="password"
                        value={keyDraft[p.id] ?? ""}
                        onChange={(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && void saveKey(p.id)}
                        placeholder={p.envKey ?? "API key"}
                        className="h-7 flex-1 rounded-md border border-border bg-editor px-2 font-mono text-[11px] outline-none focus:border-primary/50"
                      />
                      <button
                        type="button"
                        onClick={() => void saveKey(p.id)}
                        disabled={!(keyDraft[p.id] ?? "").trim() || savingKey === p.id}
                        className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                      >
                        {savingKey === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </button>
                    </div>
                  ) : models.length === 0 ? (
                    <p className="px-2 pb-1.5 text-[10.5px] text-muted-foreground/70">
                      {p.installedOnly ? "Start the server to see its models." : "No models available."}
                    </p>
                  ) : (
                    models.map((m) => {
                      const active = model?.providerID === p.id && model?.modelID === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onPick({ providerID: p.id, modelID: m.id, label: `${p.name} · ${m.name || m.id}` });
                            setOpen(false);
                          }}
                          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary", active ? "text-primary" : "text-foreground")}
                        >
                          {active ? <Check className="h-3 w-3 shrink-0" /> : <span className="w-3 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{m.name || m.id}</span>
                          <ModelBadges context={m.context} reasoning={m.reasoning} image={m.image} />
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
