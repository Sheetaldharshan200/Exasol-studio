import { useState } from "react";
import { Check, ChevronDown, ExternalLink, KeyRound, Loader2, Search, X } from "lucide-react";
import { agent, type AgentProviderInfo, type EngineAuthMethod, type EngineCatalogProvider, type EngineOAuthAuthorization } from "@/lib/agent-client";
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
  onConnected,
  loadCatalog,
  open,
  onOpenChange,
}: {
  providers: AgentProviderInfo[];
  model: PickedModel | null;
  onPick: (m: PickedModel) => void;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  /** Called after an OAuth connect succeeds (refresh providers/models). */
  onConnected?: () => Promise<void> | void;
  /** The FULL models.dev catalog for the merged provider list. */
  loadCatalog?: () => Promise<EngineCatalogProvider[]>;
  /** Controlled open state, so other UI (the model pill) can open this menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  /** Result of the check-then-save per provider: verified or rejected. */
  const [keyVerdict, setKeyVerdict] = useState<Record<string, "ok" | "fail">>({});
  const [catalog, setCatalog] = useState<EngineCatalogProvider[] | "loading" | "error" | null>(null);
  /** A catalog provider being connected (method picker → prompts → auth). */
  const [connecting, setConnecting] = useState<EngineCatalogProvider | null>(null);
  // The engine's per-provider auth methods (GET /provider/auth). Providers
  // without an entry get the TUI's synthesized default: a single API-key method.
  const [authMethods, setAuthMethods] = useState<Record<string, EngineAuthMethod[]> | null>(null);
  const [methodIdx, setMethodIdx] = useState<number | null>(null);
  const [promptInputs, setPromptInputs] = useState<Record<string, string>>({});
  const [oauth, setOauth] = useState<EngineOAuthAuthorization | null>(null);
  const [oauthState, setOauthState] = useState<"idle" | "waiting" | "failed">("idle");
  const [codeDraft, setCodeDraft] = useState("");

  const resetConnectFlow = () => {
    setMethodIdx(null);
    setPromptInputs({});
    setOauth(null);
    setOauthState("idle");
    setCodeDraft("");
  };

  /** Open a URL in the system browser (Tauri webviews ignore target=_blank). */
  async function openExternal(url: string) {
    // Rust-side first: never blocked by webview capability scopes.
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external", { url });
      return;
    } catch {
      /* web build or command missing — try the plugin, then window.open */
    }
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noreferrer");
    }
  }

  /** Kick off an OAuth method: authorize, then (for auto flows) await the callback. */
  async function startOauth(providerId: string, idx: number, inputs: Record<string, string>) {
    setOauthState("waiting");
    try {
      const r = await agent.engine.oauthAuthorize(providerId, idx, inputs);
      if (!r.authorization) {
        setOauthState("failed");
        return;
      }
      setOauth(r.authorization);
      void openExternal(r.authorization.url); // straight into the browser
      if (r.authorization.method === "auto") {
        // The engine polls the flow inline; this resolves when auth completes.
        const done = await agent.engine.oauthCallback(providerId, idx);
        finishOauth(done.ok);
      }
      // method "code": wait for the user to paste the code (submitOauthCode).
    } catch {
      setOauthState("failed");
    }
  }

  async function submitOauthCode(providerId: string, idx: number) {
    if (!codeDraft.trim()) return;
    setOauthState("waiting");
    try {
      const done = await agent.engine.oauthCallback(providerId, idx, codeDraft.trim());
      finishOauth(done.ok);
    } catch {
      setOauthState("failed");
    }
  }

  function finishOauth(ok: boolean) {
    if (!ok) {
      setOauthState("failed");
      return;
    }
    resetConnectFlow();
    setConnecting(null);
    void onConnected?.();
  }

  const needsKey = (p: AgentProviderInfo) => p.kind === "cloud" && p.id !== "in-database" && !p.configured;

  function fetchCatalog() {
    if (authMethods === null) {
      agent.engine
        .authMethods()
        .then((r) => setAuthMethods(r.methods))
        // Leave null on failure so the next menu open retries — otherwise a
        // pre-engine fetch would permanently hide the real auth methods.
        .catch(() => setAuthMethods(null));
    }
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
    setKeyVerdict((d) => {
      const next = { ...d };
      delete next[providerId];
      return next;
    });
    try {
      // Check THEN save: the key is written to the engine, providers reload,
      // and we confirm the engine now reports the provider as connected.
      await onSaveKey(providerId, key);
      const conn = await agent.engine.connected().catch(() => ({ connected: [] as string[] }));
      const ok = conn.connected.includes(providerId);
      setKeyVerdict((d) => ({ ...d, [providerId]: ok ? "ok" : "fail" }));
      if (ok) setKeyDraft((d) => ({ ...d, [providerId]: "" }));
    } finally {
      setSavingKey(null);
    }
  }

  const pick = (p: AgentProviderInfo, m: AgentProviderInfo["models"][number]) =>
    onPick({ providerID: p.id, modelID: m.id, label: `${p.name} · ${m.name || m.id}` });

  const keyInput = (providerId: string, envKey?: string) => (
    <div className="px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
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
          {savingKey === providerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {savingKey === providerId ? "Checking…" : "Check & save"}
        </button>
      </div>
      {keyVerdict[providerId] === "ok" ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-foreground/80">
          <Check className="h-3 w-3" /> Connected — models unlocked.
        </p>
      ) : keyVerdict[providerId] === "fail" ? (
        <p className="mt-1 text-[11px] text-destructive">The engine couldn't connect with this key — check it and retry.</p>
      ) : null}
    </div>
  );

  /**
   * The connect flow for one catalog provider, rendered inside its `>`
   * submenu: auth-method list → prompts → OAuth link/code or key input.
   * Flow state (method, prompts, oauth) applies only to the provider the
   * user is actively connecting (`connecting`).
   */
  const connectFlow = (c: EngineCatalogProvider) => {
    const mine = connecting?.id === c.id;
    const methods: EngineAuthMethod[] = authMethods?.[c.id] ?? [{ type: "api", label: "API key" }];
    const chosen = mine && methodIdx !== null ? methods[methodIdx] : methods.length === 1 ? methods[0] : null;
    const chosenIdx = mine && methodIdx !== null ? methodIdx : methods.length === 1 ? 0 : null;
    const flowOauth = mine ? oauth : null;
    const flowState = mine ? oauthState : "idle";
    const prompts = (chosen?.prompts ?? []).filter((pr) =>
      !pr.when ? true : pr.when.op === "eq" ? promptInputs[pr.when.key] === pr.when.value : promptInputs[pr.when.key] !== pr.when.value,
    );
    const promptsAnswered = prompts.every((pr) => (promptInputs[pr.key] ?? "").trim() !== "");
    return (
      <div className="py-1">
        {flowOauth ? (
          <div className="px-2 py-1">
            <button
              type="button"
              onClick={() => void openExternal(flowOauth.url)}
              className="flex items-center gap-1.5 break-all text-left text-[12px] text-foreground underline underline-offset-2 hover:opacity-80"
            >
              <ExternalLink className="h-3 w-3 shrink-0" /> {flowOauth.url}
            </button>
            {flowOauth.instructions ? <p className="mt-1.5 font-mono text-[11.5px] text-foreground">{flowOauth.instructions}</p> : null}
            {flowOauth.method === "code" && flowState !== "waiting" ? (
              <div className="mt-1.5 flex items-center gap-1.5" onKeyDown={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && chosenIdx !== null && void submitOauthCode(c.id, chosenIdx)}
                  placeholder="Paste the code…"
                  className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-ring"
                />
                <button
                  type="button"
                  onClick={() => chosenIdx !== null && void submitOauthCode(c.id, chosenIdx)}
                  disabled={!codeDraft.trim()}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> Submit
                </button>
              </div>
            ) : null}
            {flowState === "waiting" ? (
              <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Waiting for authorization…
              </p>
            ) : flowState === "failed" ? (
              <p className="mt-2 text-[11px] text-destructive">Authorization failed — retry.</p>
            ) : null}
          </div>
        ) : chosen && chosen.type === "api" ? (
          <>
            <p className="px-2 pt-0.5 text-[11px] text-muted-foreground">
              Set the {c.env[0] ?? "API"} key to connect {c.name}.
            </p>
            {keyInput(c.id, c.env[0])}
          </>
        ) : chosen ? (
          <div className="px-2 py-0.5">
            {prompts.map((pr) =>
              pr.type === "select" ? (
                <div key={pr.key} className="mb-1.5">
                  <p className="pb-1 text-[11px] text-muted-foreground">{pr.message}</p>
                  {(pr.options ?? []).map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setPromptInputs((d) => ({ ...d, [pr.key]: o.value }))}
                      className={cn("hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]", promptInputs[pr.key] === o.value && "bg-muted")}
                    >
                      {promptInputs[pr.key] === o.value ? <Check className="h-3 w-3 shrink-0" /> : <span className="w-3 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint ? <span className="shrink-0 text-[10px] text-muted-foreground">{o.hint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div key={pr.key} className="mb-1.5" onKeyDown={(e) => e.stopPropagation()}>
                  <p className="pb-1 text-[11px] text-muted-foreground">{pr.message}</p>
                  <input
                    value={promptInputs[pr.key] ?? ""}
                    onChange={(e) => setPromptInputs((d) => ({ ...d, [pr.key]: e.target.value }))}
                    placeholder={pr.placeholder}
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-[11.5px] outline-none focus:border-ring"
                  />
                </div>
              ),
            )}
            <button
              type="button"
              disabled={!promptsAnswered || flowState === "waiting"}
              onClick={() => chosenIdx !== null && void startOauth(c.id, chosenIdx, promptInputs)}
              className="mt-0.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-foreground text-[11.5px] font-medium text-background disabled:opacity-50"
            >
              {flowState === "waiting" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />} Sign in
            </button>
          </div>
        ) : (
          <>
            <p className="px-2 pt-0.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Select auth method</p>
            {methods.map((m, i) => (
              <button
                key={`${m.label}-${i}`}
                type="button"
                onClick={() => {
                  resetConnectFlow();
                  setConnecting(c);
                  setMethodIdx(i);
                  if (m.type === "oauth" && !(m.prompts ?? []).length) void startOauth(c.id, i, {});
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]"
              >
                {m.type === "oauth" ? <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" /> : <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        onOpenChange?.(o);
        if (o) fetchCatalog();
        else {
          setSearchOpen(false);
          setQuery("");
          setConnecting(null);
          resetConnectFlow();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Provider & models"
          className="hover:bg-muted focus-visible:bg-muted flex h-7 min-w-0 max-w-[170px] items-center gap-1.5 rounded-full px-2.5 text-[12px] text-foreground/80 outline-none transition-colors @md:max-w-[260px]"
        >
          {model ? <ProviderMark providerId={model.providerID} className="h-3.5 w-3.5 shrink-0" /> : null}
          <span className="truncate">
            {model
              ? providers.find((p) => p.id === model.providerID)?.models.find((m) => m.id === model.modelID)?.name ?? model.modelID
              : "Select model"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)] rounded-xl p-1.5">
        {/* Header: label + search & settings top-right. */}
        <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            AI providers
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Search providers"
              onClick={() => {
                setConnecting(null);
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery("");
                fetchCatalog();
              }}
              className={cn("hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", searchOpen && "bg-muted text-foreground")}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />

        {(
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
              // Every catalog provider is a `>` submenu whose side pane holds
              // the connect flow (auth methods / key entry, check-then-save).
              const catalogRow = (c: EngineCatalogProvider, withLogo: boolean) => (
                <DropdownMenuSub key={c.id}>
                  <DropdownMenuSubTrigger className="gap-2">
                    {withLogo ? <ProviderMark providerId={c.id} className="h-3.5 w-3.5 shrink-0" /> : null}
                    <span className="min-w-0 flex-1 truncate text-[12px]">{c.name}</span>
                    <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-80 w-72 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl p-1 [scrollbar-width:thin]"
                    sideOffset={6}
                    collisionPadding={12}
                  >
                    {connectFlow(c)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
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
                          // Unconnected cloud providers get the SAME engine-
                          // driven connect flow as catalog rows (e.g. OpenAI's
                          // ChatGPT Pro/Plus sign-ins, not just a key box).
                          connectFlow({ id: p.id, name: p.name, env: p.envKey ? [p.envKey] : [], modelCount: 0, popular: false })
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
