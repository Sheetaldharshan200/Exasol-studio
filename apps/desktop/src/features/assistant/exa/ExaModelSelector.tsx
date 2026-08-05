import { useMemo, useState } from "react";
import { Check, ChevronDown, KeyRound, Loader2, Search, Settings2, X } from "lucide-react";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { ProviderMark, ModelBadges } from "@/features/assistant/provider-marks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PickedModel = { providerID: string; modelID: string; label: string };

/**
 * Quick model switch — a second, flat dropdown listing ONLY the selected
 * provider's models, so changing models doesn't require re-walking the
 * provider submenu. Renders nothing until a provider is picked.
 */
export function ExaModelQuickSwitch({
  providers,
  model,
  onPick,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPick: (m: PickedModel) => void;
}) {
  const provider = model ? providers.find((p) => p.id === model.providerID) : undefined;
  if (!provider || provider.models.length === 0) return null;
  const current = provider.models.find((m) => m.id === model!.modelID);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`${provider.name} models`}
          className="hover:bg-muted flex h-7 max-w-[140px] items-center gap-1 rounded-full px-2 text-[12px] text-foreground/80 transition-colors @md:max-w-[200px]"
        >
          <span className="truncate">{current?.name ?? model!.modelID}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} collisionPadding={12} className="max-h-72 w-60 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl p-1 [scrollbar-width:thin]">
        {provider.models.map((m) => {
          const active = model?.modelID === m.id;
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => onPick({ providerID: provider.id, modelID: m.id, label: `${provider.name} · ${m.name || m.id}` })}
              className="gap-2"
            >
              {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[12px]">{m.name || m.id}</span>
              <ModelBadges context={m.context} reasoning={m.reasoning} image={m.image} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The composer's model selector, in the assistant-ui model-selector design
 * language: a ghost rounded-full trigger opening a menu that lists PROVIDERS —
 * each row a `>` submenu with that provider's models. Top-right: search
 * (flat filtered model list) and settings (API-key management). A cloud
 * provider's models unlock only once its key is saved.
 */
export function ExaModelSelector({
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
  const [view, setView] = useState<"providers" | "search" | "settings">("providers");
  const [query, setQuery] = useState("");
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const needsKey = (p: AgentProviderInfo) => p.kind === "cloud" && p.id !== "in-database" && !p.configured;

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

  // Flat search across every selectable model (locked providers excluded).
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { p: AgentProviderInfo; m: AgentProviderInfo["models"][number] }[] = [];
    for (const p of providers) {
      if (needsKey(p)) continue;
      for (const m of p.models) {
        if ((m.name || m.id).toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) out.push({ p, m });
      }
    }
    return out.slice(0, 30);
  }, [providers, query]);

  const pick = (p: AgentProviderInfo, m: AgentProviderInfo["models"][number]) =>
    onPick({ providerID: p.id, modelID: m.id, label: `${p.name} · ${m.name || m.id}` });

  const keyInput = (p: AgentProviderInfo) => (
    <div className="flex items-center gap-1.5 px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
      <input
        type="password"
        value={keyDraft[p.id] ?? ""}
        onChange={(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && void saveKey(p.id)}
        placeholder={p.envKey ?? "API key"}
        className="h-7 w-44 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-ring"
      />
      <button
        type="button"
        onClick={() => void saveKey(p.id)}
        disabled={!(keyDraft[p.id] ?? "").trim() || savingKey === p.id}
        className="flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background disabled:opacity-50"
      >
        {savingKey === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
      </button>
    </div>
  );

  const modelRow = (p: AgentProviderInfo, m: AgentProviderInfo["models"][number]) => {
    const active = model?.providerID === p.id && model?.modelID === m.id;
    return (
      <DropdownMenuItem key={`${p.id}/${m.id}`} onSelect={() => pick(p, m)} className="gap-2">
        {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-[12px]">{m.name || m.id}</span>
        <ModelBadges context={m.context} reasoning={m.reasoning} image={m.image} />
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) { setView("providers"); setQuery(""); } }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Provider & models"
          className="hover:bg-muted flex h-7 max-w-[130px] items-center gap-1.5 rounded-full px-2.5 text-[12px] text-foreground/80 transition-colors @md:max-w-[180px]"
        >
          {model ? <ProviderMark providerId={model.providerID} className="h-3.5 w-3.5 shrink-0" /> : null}
          <span className="truncate">
            {model ? providers.find((p) => p.id === model.providerID)?.name ?? model.providerID : "Select model"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] rounded-xl p-1.5">
        {/* Header: label + search & settings top-right. */}
        <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {view === "settings" ? "API keys" : "Models"}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Search models"
              onClick={() => setView((v) => (v === "search" ? "providers" : "search"))}
              className={cn("hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", view === "search" && "bg-muted text-foreground")}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Provider settings & API keys"
              onClick={() => setView((v) => (v === "settings" ? "providers" : "settings"))}
              className={cn("hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", view === "settings" && "bg-muted text-foreground")}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />

        {view === "search" ? (
          <>
            <div className="relative px-1 py-1" onKeyDown={(e) => e.stopPropagation()}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-[12px] outline-none focus:border-ring"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
              {query.trim() === "" ? (
                <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">Type to search across all providers.</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">No models match “{query}”.</p>
              ) : (
                searchResults.map(({ p, m }) => {
                  const active = model?.providerID === p.id && model?.modelID === m.id;
                  return (
                    <DropdownMenuItem key={`${p.id}/${m.id}`} onSelect={() => pick(p, m)} className="gap-2">
                      <ProviderMark providerId={p.id} className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[12px]">{m.name || m.id}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{p.name}</span>
                      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
          </>
        ) : view === "settings" ? (
          <div className="max-h-72 overflow-y-auto py-0.5 [scrollbar-width:thin]">
            {providers.filter((p) => p.kind === "cloud" && p.id !== "in-database").map((p) => (
              <div key={p.id} className="mb-0.5">
                <div className="flex items-center gap-2 px-2 pt-1.5">
                  <ProviderMark providerId={p.id} className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-medium">{p.name}</span>
                  <span className={cn("ml-auto flex items-center gap-1 text-[10px]", p.configured ? "text-foreground/70" : "text-muted-foreground")}>
                    <KeyRound className="h-2.5 w-2.5" /> {p.configured ? "connected" : "not set"}
                  </span>
                </div>
                {keyInput(p)}
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto py-0.5 [scrollbar-width:thin]">
            {providers.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                No providers yet — run Ollama or LM Studio, or add an API key via the settings icon.
              </p>
            ) : (
              providers.map((p) => (
                <DropdownMenuSub key={p.id}>
                  <DropdownMenuSubTrigger className="gap-2">
                    <ProviderMark providerId={p.id} className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{p.name}</span>
                    {needsKey(p) ? (
                      <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {p.kind === "local" ? (p.installedOnly ? "off" : p.running ? "on" : "") : p.models.length || ""}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-72 w-60 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl p-1 [scrollbar-width:thin]"
                    sideOffset={6}
                    collisionPadding={12}
                  >
                    {needsKey(p) ? (
                      <>
                        <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">
                          Set the {p.envKey ?? "API"} key to unlock {p.name}'s models.
                        </p>
                        {keyInput(p)}
                      </>
                    ) : p.models.length === 0 ? (
                      <p className="px-2 py-2 text-[11px] text-muted-foreground">
                        {p.installedOnly ? "Start the server to see its models." : "No models available."}
                      </p>
                    ) : (
                      p.models.map((m) => modelRow(p, m))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
