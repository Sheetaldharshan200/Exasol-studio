import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, Settings, Zap } from "lucide-react";
import { llm, type LlmProgress, type LlmStatus } from "@/lib/agent-client";
import type { AgentProviderInfo } from "@/lib/agent-client";
import { ProviderMark, ModelBadges } from "@/features/assistant/provider-marks";
import { cn } from "@/lib/utils";

/**
 * The model picker: ONE flat, searchable list of the models that are actually
 * selectable right now — built-in downloaded models, running local runtimes,
 * configured cloud providers, and a configured in-database endpoint. Typing in
 * the box filters live. Everything about installing engines, downloading
 * models, or adding API keys lives in AI Settings (the footer button).
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
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshLlm = () => llm.status().then(setLlmState).catch(() => setLlmState(null));
  useEffect(() => {
    void refreshLlm();
    inputRef.current?.focus();
    const un = llm.onProgress(setProgress);
    return () => void un.then((f) => f());
  }, []);

  async function startBuiltin(modelId: string, ref: string) {
    setBusy(ref);
    setError(null);
    try {
      await llm.start(modelId);
      await refreshLlm();
      onRefresh();
      onPick(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  type Row = {
    ref: string;
    pid: string;
    name: string;
    sub?: string;
    info?: { context?: number; toolCall?: boolean; reasoning?: boolean; image?: boolean };
    /** Built-in model that must be started before use. */
    startId?: string;
    running?: boolean;
  };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    // Built-in: downloaded models only (setup lives in AI Settings).
    if (llmState?.supported && llmState.engineInstalled) {
      for (const m of llmState.models.filter((x) => x.downloaded)) {
        const running = llmState.runningModel === m.id;
        out.push({ ref: `builtin/${m.name}`, pid: "builtin", name: m.name, sub: "on-device", running, startId: running ? undefined : m.id });
      }
    }
    // Local runtimes that are running.
    for (const p of providers.filter((x) => x.kind === "local" && x.id !== "builtin" && x.running)) {
      for (const m of p.models) out.push({ ref: `${p.id}/${m.id}`, pid: p.id, name: m.name || m.id, sub: p.name.replace(" (local)", ""), info: m });
    }
    // Configured cloud providers.
    for (const p of providers.filter((x) => x.kind === "cloud" && x.id !== "in-database" && x.configured)) {
      for (const m of p.models) out.push({ ref: `${p.id}/${m.id}`, pid: p.id, name: m.name || m.id, sub: p.name, info: m });
    }
    // In-database endpoint when configured.
    const inDb = providers.find((x) => x.id === "in-database");
    if (inDb?.configured) {
      for (const m of inDb.models) out.push({ ref: `in-database/${m.id}`, pid: "in-database", name: m.name || m.id, sub: "In-database", info: m });
    }
    return out;
  }, [providers, llmState]);

  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.sub ?? "").toLowerCase().includes(q)) : rows;

  return (
    <div className="flex max-h-[420px] w-full flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      {/* Type to search — filters the list live. */}
      <div className="relative shrink-0 border-b border-border">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          className="h-9 w-full bg-transparent pl-9 pr-3 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
        {error ? (
          <div className="mx-2 my-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-foreground">{error}</div>
        ) : null}
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
            {rows.length === 0
              ? "No models available yet — set up a provider in AI settings."
              : `Nothing matches “${query}”.`}
          </p>
        ) : (
          visible.map((r) => {
            const selected = model === r.ref;
            const starting = busy === r.ref;
            return (
              <div key={r.ref}>
                <button
                  onClick={() => {
                    if (r.startId) void startBuiltin(r.startId, r.ref);
                    else onPick(r.ref);
                  }}
                  disabled={busy !== null && !starting}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-60",
                    selected ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  {r.pid === "builtin" ? (
                    <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <ProviderMark providerId={r.pid} className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground" title={`${r.name}${r.sub ? ` · ${r.sub}` : ""}`}>
                    {r.name}
                  </span>
                  {r.running ? <span className="shrink-0 text-[9px] font-medium uppercase text-primary">running</span> : null}
                  {r.info ? <ModelBadges context={r.info.context} reasoning={r.info.reasoning} image={r.info.image} /> : null}
                  {starting ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" /> : null}
                  {selected ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                </button>
                {starting && progress ? (
                  <div className="px-3 pb-1.5">
                    <div className="h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full bg-primary transition-[width]", progress.pct === null && "w-1/3 animate-pulse")}
                        style={progress.pct !== null ? { width: `${Math.round(progress.pct)}%` } : undefined}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{progress.msg}</p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* One exit: AI settings — engines, downloads, keys, everything. */}
      <button
        onClick={onManage}
        className="flex w-full shrink-0 items-center gap-1.5 border-t border-border px-3 py-2 text-left text-[11.5px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      >
        <Settings className="h-3.5 w-3.5" /> AI settings
      </button>
    </div>
  );
}
