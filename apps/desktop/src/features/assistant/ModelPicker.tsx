import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Download,
  Loader2,
  MoreHorizontal,
  Play,
  SlidersHorizontal,
  Square,
  Zap,
} from "lucide-react";
import {
  llm,
  type AgentProviderInfo,
  type LlmProgress,
  type LlmStatus,
} from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * The model selection popup: search on top, collapsible groups below.
 * Built-in local models come FIRST with install/run right here — no detour
 * through the providers window for the happy path.
 */
export function ModelPicker({
  providers,
  model,
  onPick,
  onManage,
  onRefresh,
}: {
  providers: AgentProviderInfo[];
  model: string;
  onPick: (ref: string) => void;
  onManage: () => void;
  onRefresh: () => void;
}) {
  const [llmState, setLlmState] = useState<LlmStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<LlmProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    // Collapsed by default — only the group holding the ACTIVE model opens,
    // and Built-in AI stays collapsed always (it's a setup surface, not a
    // list the user browses every time).
    const pid = model.split("/")[0] ?? "";
    return {
      builtin: false,
      local: ["ollama", "lmstudio", "llamacpp"].includes(pid),
      cloud: ["anthropic", "openai", "google", "openrouter"].includes(pid),
      "in-database": pid === "in-database",
    };
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshLlm = () => llm.status().then(setLlmState).catch(() => setLlmState(null));

  useEffect(() => {
    void refreshLlm();
    const un = llm.onProgress(setProgress);
    return () => void un.then((f) => f());
  }, []);

  // Search removed by design: the list is short and grouped — groups are the
  // navigation. These constants keep the row filters inert.
  const q = "";
  const searching = false;
  const isOpen = (key: string) => Boolean(open[key]);
  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  async function run(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setProgress(null);
    setError(null);
    try {
      await fn();
      await refreshLlm();
      onRefresh();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const builtinProvider = providers.find((p) => p.id === "builtin");
  const locals = providers.filter((p) => p.kind === "local" && p.id !== "builtin" && (p.running || p.installedOnly));
  const clouds = providers.filter((p) => p.kind === "cloud" && p.id !== "in-database");
  const inDb = providers.find((p) => p.id === "in-database");

  const builtinModels = useMemo(
    () => (llmState?.models ?? []).filter((m) => !q || m.name.toLowerCase().includes(q)),
    [llmState, q],
  );

  return (
    <div className="flex max-h-[420px] w-full flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="mx-2 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-foreground">
            {error}
          </div>
        ) : null}

        {/* ── Built-in AI (always first) ── */}
        {llmState?.supported ? (
          <Group
            label="Built-in AI"
            icon={Zap}
            badge="recommended"
            count={builtinModels.length}
            open={isOpen("builtin")}
            onToggle={() => toggle("builtin")}
            action={
              llmState.engineInstalled ? (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((v) => !v);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Built-in AI options"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                  {menuOpen ? (
                    <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          void run("prefs", () => llm.setAutoStart(!llmState.autoStart));
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] text-foreground hover:bg-secondary/60"
                      >
                        <span
                          className={cn(
                            "flex h-3 w-3 items-center justify-center rounded-sm border",
                            llmState.autoStart ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {llmState.autoStart ? <Check className="h-2 w-2" /> : null}
                        </span>
                        Auto-start on launch
                      </button>
                      {llmState.runningModel ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(false);
                            void run("prefs", () => llm.stop());
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] text-muted-foreground hover:bg-secondary/60 hover:text-destructive"
                        >
                          <Square className="h-3 w-3" /> Stop engine
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : undefined
            }
          >
            {!llmState.engineInstalled ? (
              <div className="mx-2 mb-2 rounded-lg border border-border bg-panel/60 px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">
                  One-time ~15 MB engine download — then models run fully offline.
                </p>
                <button
                  onClick={() => void run("engine", () => llm.installEngine())}
                  disabled={busy !== null}
                  className="mt-1.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
                >
                  {busy === "engine" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  {busy === "engine" ? "Installing…" : "Install engine"}
                </button>
                {busy === "engine" && progress ? <Progress p={progress} /> : null}
              </div>
            ) : (
              builtinModels.map((m) => {
                const active = llmState.runningModel === m.id;
                const ref = `builtin/${m.name}`;
                const selected = model === ref;
                const key = `m:${m.id}`;
                const providerHasIt = builtinProvider?.models.some((x) => x.id === m.name);
                return (
                  <div key={m.id} className="group/row">
                    <div
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                        selected ? "bg-secondary" : "hover:bg-secondary/60",
                        active && providerHasIt && "cursor-pointer",
                      )}
                      onClick={() => {
                        if (active && providerHasIt) onPick(ref);
                      }}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-primary" : "bg-muted-foreground/30")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-foreground">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(m.sizeMb / 1024).toFixed(1)} GB · {m.description}
                        </div>
                      </div>
                      {selected ? (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      ) : active ? (
                        <span className="shrink-0 text-[9px] font-medium uppercase text-primary">running</span>
                      ) : m.downloaded ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void run(key, () => llm.start(m.id), () => onPick(ref));
                          }}
                          disabled={busy !== null}
                          className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-[10.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
                        >
                          {busy === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                          {busy === key ? "Loading…" : "Run"}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void run(key, () => llm.installModel(m.id));
                          }}
                          disabled={busy !== null}
                          className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[10.5px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                        >
                          {busy === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                          Get
                        </button>
                      )}
                    </div>
                    {busy === key && progress ? (
                      <div className="px-3 pb-1.5">
                        <Progress p={progress} />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </Group>
        ) : null}

        {/* ── Local (all detected runtimes) ── */}
        {(() => {
          const rows = locals.flatMap((p) =>
            p.models
              .filter((m) => !q || m.name.toLowerCase().includes(q))
              .map((m) => ({ ref: `${p.id}/${m.id}`, name: m.name, tag: p.name.replace(" (local)", "") })),
          );
          const hintOnly = locals.every((p) => p.installedOnly) && locals.length > 0;
          if (searching && rows.length === 0) return null;
          return (
            <Group
              label="Local"
              icon={Cpu}
              count={rows.length}
              open={isOpen("local")}
              onToggle={() => toggle("local")}
            >
              {rows.length === 0 ? (
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                  {hintOnly ? (
                    <>Ollama is installed but not running — start it with <code className="rounded bg-secondary px-1">ollama serve</code>.</>
                  ) : (
                    "No local runtimes detected (Ollama, LM Studio, llama.cpp)."
                  )}
                </p>
              ) : (
                rows.map((r) => (
                  <button
                    key={r.ref}
                    onClick={() => onPick(r.ref)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                      model === r.ref ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{r.name}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{r.tag}</span>
                    {model === r.ref ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                  </button>
                ))
              )}
            </Group>
          );
        })()}

        {/* ── Cloud (all providers) ── */}
        {(() => {
          const rows = clouds
            .filter((p) => p.configured)
            .flatMap((p) =>
              p.models
                .filter((m) => !q || m.name.toLowerCase().includes(q))
                .map((m) => ({ ref: `${p.id}/${m.id}`, name: m.name, tag: p.name })),
            );
          const missing = clouds.filter((p) => !p.configured);
          if (searching && rows.length === 0) return null;
          return (
            <Group
              label="Cloud"
              icon={Cloud}
              count={rows.length}
              open={isOpen("cloud")}
              onToggle={() => toggle("cloud")}
            >
              {rows.map((r) => (
                <button
                  key={r.ref}
                  onClick={() => onPick(r.ref)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                    model === r.ref ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{r.name}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{r.tag}</span>
                  {model === r.ref ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                </button>
              ))}
              {!searching &&
                missing.map((p) => (
                  <button
                    key={p.id}
                    onClick={onManage}
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11.5px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <SlidersHorizontal className="h-3 w-3" /> {p.name} — add API key…
                  </button>
                ))}
            </Group>
          );
        })()}

        {/* ── In-Database / Enterprise AI (always shown so it's discoverable) ── */}
        {!searching || inDb?.configured ? (
          <Group
            label="In-Database AI"
            icon={Database}
            count={inDb?.configured ? inDb.models.length : undefined}
            open={isOpen("in-database")}
            onToggle={() => toggle("in-database")}
          >
            {inDb?.configured && inDb.models.length ? (
              inDb.models
                .filter((m) => !q || m.name.toLowerCase().includes(q))
                .map((m) => {
                  const ref = `in-database/${m.id}`;
                  return (
                    <button
                      key={ref}
                      onClick={() => onPick(ref)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                        model === ref ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{m.name}</span>
                      {model === ref ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                    </button>
                  );
                })
            ) : (
              <button
                onClick={onManage}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11.5px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                <SlidersHorizontal className="h-3 w-3" /> Set up your own / cluster LLM endpoint…
              </button>
            )}
          </Group>
        ) : null}
      </div>

      <button
        onClick={onManage}
        className="flex w-full shrink-0 items-center gap-1.5 border-t border-border px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      >
        <SlidersHorizontal className="h-3 w-3" /> Manage providers…
      </button>
    </div>
  );
}

function Group({
  label,
  icon: Icon,
  badge,
  count,
  open,
  onToggle,
  action,
  children,
}: {
  label: string;
  icon: typeof Cpu;
  badge?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div
        onClick={onToggle}
        role="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-2 text-left hover:bg-secondary/40"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Icon className="h-3 w-3 shrink-0 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{label}</span>
        {badge ? (
          <span className="rounded bg-primary/15 px-1 py-px text-[8px] font-medium uppercase text-primary">{badge}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          {typeof count === "number" ? (
            <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
          ) : null}
          {action}
        </span>
      </div>
      {open ? <div className="pb-1">{children}</div> : null}
    </div>
  );
}

function Progress({ p }: { p: LlmProgress }) {
  return (
    <div className="mt-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${p.pct ?? 30}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{p.msg}</div>
    </div>
  );
}
