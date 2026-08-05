import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, KeyRound, Loader2, Search, Settings2, X } from "lucide-react";
import type { AgentProviderInfo, EngineCatalogProvider } from "@/lib/agent-client";
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
  onOpenProviders,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPick: (m: PickedModel) => void;
  /** Jump from here into the full provider menu ("All providers…"). */
  onOpenProviders?: () => void;
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
          className="hover:bg-muted focus-visible:bg-muted flex h-7 min-w-0 max-w-[120px] items-center gap-1 rounded-full px-2 text-[12px] text-foreground/80 outline-none transition-colors @md:max-w-[200px]"
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
        {onOpenProviders ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenProviders} className="gap-2 text-muted-foreground">
              <span className="w-3.5 shrink-0" />
              <span className="text-[12px]">All providers…</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The composer's model selector, in the assistant-ui model-selector design
 * language: a ghost rounded-full trigger opening ONE list — the configured
 * providers (each a `>` submenu of its models), then the full opencode
 * catalog: Popular (with logos) and All providers (name only). Search
 * (top-right) filters PROVIDERS in place; settings manages API keys. Picking
 * an unconnected catalog provider shows its key input inline; saving unlocks
 * its models.
 */
export function ExaModelSelector({
  providers,
  model,
  onPick,
  onSaveKey,
  loadCatalog,
  open,
  onOpenChange,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPick: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  /** The FULL models.dev catalog for the merged provider list. */
  loadCatalog?: () => Promise<EngineCatalogProvider[]>;
  /** Controlled open state, so other UI (the model pill) can open this menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [view, setView] = useState<"providers" | "settings">("providers");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<EngineCatalogProvider[] | "loading" | "error" | null>(null);
  /** A catalog provider awaiting its API key (inline connect). */
  const [connecting, setConnecting] = useState<EngineCatalogProvider | null>(null);

  const needsKey = (p: AgentProviderInfo) => p.kind === "cloud" && p.id !== "in-database" && !p.configured;

  function fetchCatalog() {
    if (!loadCatalog || (catalog !== null && catalog !== "error")) return;
    setCatalog("loading");
    loadCatalog()
      .then(setCatalog)
      .catch(() => setCatalog("error"));
  }

  async function saveKey(providerId: string) {
    const key = (keyDraft[providerId] ?? "").trim();
    if (!key) return;
    setSavingKey(providerId);
    try {
      await onSaveKey(providerId, key);
      setKeyDraft((d) => ({ ...d, [providerId]: "" }));
      setConnecting((c) => (c?.id === providerId ? null : c));
    } finally {
      setSavingKey(null);
    }
  }

  const pick = (p: AgentProviderInfo, m: AgentProviderInfo["models"][number]) =>
    onPick({ providerID: p.id, modelID: m.id, label: `${p.name} · ${m.name || m.id}` });

  const keyInput = (providerId: string, envKey?: string) => (
    <div className="flex items-center gap-1.5 px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
      <input
        type="password"
        value={keyDraft[providerId] ?? ""}
        onChange={(e) => setKeyDraft((d) => ({ ...d, [providerId]: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && void saveKey(providerId)}
        placeholder={envKey ?? "API key"}
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-ring"
      />
      <button
        type="button"
        onClick={() => void saveKey(providerId)}
        disabled={!(keyDraft[providerId] ?? "").trim() || savingKey === providerId}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background disabled:opacity-50"
      >
        {savingKey === providerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
      </button>
    </div>
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        onOpenChange?.(o);
        if (o) fetchCatalog();
        else {
          setView("providers");
          setSearchOpen(false);
          setQuery("");
          setConnecting(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Provider & models"
          className="hover:bg-muted focus-visible:bg-muted flex h-7 min-w-0 max-w-[110px] items-center gap-1.5 rounded-full px-2.5 text-[12px] text-foreground/80 outline-none transition-colors @md:max-w-[180px]"
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
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {connecting ? (
              <button type="button" onClick={() => setConnecting(null)} className="hover:text-foreground flex items-center gap-1" aria-label="Back to providers">
                <ArrowLeft className="h-3 w-3" /> Connect {connecting.name}
              </button>
            ) : view === "settings" ? (
              "API keys"
            ) : (
              "AI providers"
            )}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Search providers"
              onClick={() => {
                setView("providers");
                setConnecting(null);
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery("");
                fetchCatalog();
              }}
              className={cn("hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", searchOpen && "bg-muted text-foreground")}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Provider settings & API keys"
              onClick={() => {
                setConnecting(null);
                setView((v) => (v === "settings" ? "providers" : "settings"));
              }}
              className={cn("hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", view === "settings" && "bg-muted text-foreground")}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />

        {connecting ? (
          <div className="py-1">
            <p className="px-2 pt-1 text-[11px] text-muted-foreground">
              Set the {connecting.env[0] ?? "API"} key to connect {connecting.name}.
            </p>
            {keyInput(connecting.id, connecting.env[0])}
          </div>
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
                {keyInput(p.id, p.envKey)}
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-0.5 [scrollbar-width:thin]">
            {searchOpen ? (
              <div className="relative px-1 pb-1" onKeyDown={(e) => e.stopPropagation()}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search AI providers…"
                  className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-[12px] outline-none focus:border-ring"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {(() => {
              // ONE list: configured providers (submenus) → Popular catalog
              // (with logos) → All providers (name only). Search filters
              // PROVIDERS by name across all three sections.
              const q = query.trim().toLowerCase();
              const configured = q ? providers.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q)) : providers;
              const configuredIds = new Set(providers.map((p) => p.id));
              const cat = Array.isArray(catalog) ? catalog.filter((c) => !configuredIds.has(c.id)) : [];
              const catFiltered = q ? cat.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q)) : cat;
              const popular = catFiltered.filter((c) => c.popular);
              const rest = catFiltered.filter((c) => !c.popular);
              const catalogRow = (c: EngineCatalogProvider, withLogo: boolean) => (
                <DropdownMenuItem key={c.id} onSelect={(e) => { e.preventDefault(); setConnecting(c); }} className="gap-2">
                  {withLogo ? <ProviderMark providerId={c.id} className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span className="min-w-0 flex-1 truncate text-[12px]">{c.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{c.modelCount || ""}</span>
                </DropdownMenuItem>
              );
              return (
                <>
                  {configured.map((p) => (
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
                            {keyInput(p.id, p.envKey)}
                          </>
                        ) : p.models.length === 0 ? (
                          <p className="px-2 py-2 text-[11px] text-muted-foreground">
                            {p.installedOnly ? "Start the server to see its models." : "No models available."}
                          </p>
                        ) : (
                          p.models.map((m) => {
                            const active = model?.providerID === p.id && model?.modelID === m.id;
                            return (
                              <DropdownMenuItem key={m.id} onSelect={() => pick(p, m)} className="gap-2">
                                {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                                <span className="min-w-0 flex-1 truncate text-[12px]">{m.name || m.id}</span>
                                <ModelBadges context={m.context} reasoning={m.reasoning} image={m.image} />
                              </DropdownMenuItem>
                            );
                          })
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ))}
                  {popular.length > 0 ? (
                    <p className="px-2 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Popular</p>
                  ) : null}
                  {popular.map((c) => catalogRow(c, true))}
                  {rest.length > 0 ? (
                    <p className="px-2 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">All providers</p>
                  ) : null}
                  {rest.slice(0, 300).map((c) => catalogRow(c, false))}
                  {catalog === "loading" ? (
                    <p className="flex items-center justify-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading the full catalog…
                    </p>
                  ) : catalog === "error" ? (
                    <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">Full catalog unavailable — are you offline?</p>
                  ) : null}
                  {configured.length === 0 && catFiltered.length === 0 && catalog !== "loading" ? (
                    <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">No providers match “{query}”.</p>
                  ) : null}
                </>
              );
            })()}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
