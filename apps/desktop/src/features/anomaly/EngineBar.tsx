// The decision engine's state in one row: installed, answering, which models
// it holds, a model to pull. When Ollaya is missing, one button to its
// Marketplace item — nothing else is offered. The parent learns what is
// ready, so a run cannot start against a model that is not there.

import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon as BxIcon } from "@/components/ui/icon";
import { errorMessage, ipc, type DecisionStatus } from "@/lib/ipc";

export const DEFAULT_MODEL = "laya:typed-decisions";

export function EngineBar({ model, onModel, onStatus }: { model: string; onModel: (m: string) => void; onStatus: (s: DecisionStatus | null) => void }) {
  const [status, setStatus] = useState<DecisionStatus | null>(null);
  const [pullName, setPullName] = useState(DEFAULT_MODEL);
  const [pulling, setPulling] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const unlisten = useRef<UnlistenFn | null>(null);
  const live = useRef(true);

  const refresh = async () => {
    const s = await ipc.decisionsStatus().catch(() => null);
    if (!live.current) return;
    setStatus(s);
    onStatus(s);
  };
  useEffect(() => {
    live.current = true;
    void refresh();
    return () => {
      live.current = false;
      unlisten.current?.();
      unlisten.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pull() {
    setPulling(true);
    setLog(`Pulling ${pullName}…`);
    unlisten.current?.();
    const un = await listen<{ id: string; line: string }>("market:log", (e) => {
      if (e.payload.id === "anomaly" && live.current) setLog(e.payload.line);
    });
    // Unmounted while the listener was being attached: let it go at once.
    if (!live.current) {
      un();
      return;
    }
    unlisten.current = un;
    try {
      await ipc.decisionsPull(pullName);
      if (!live.current) return;
      setLog(`${pullName} is ready.`);
      onModel(pullName);
      await refresh();
    } catch (e) {
      if (live.current) setLog(errorMessage(e));
    } finally {
      if (live.current) setPulling(false);
      unlisten.current?.();
      unlisten.current = null;
    }
  }

  function openMarketplaceItem() {
    window.dispatchEvent(new CustomEvent("studio:navigate", { detail: { to: "marketplace" } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("studio:marketplace-search", { detail: { query: "ollaya" } })), 120);
  }

  if (status && !status.installed) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2 text-[12px]">
        <BxIcon name="alert" className="h-4 w-4 text-warning" />
        <span className="text-foreground">The decision engine (Ollaya) is not installed on this machine.</span>
        <button onClick={openMarketplaceItem} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85">
          <BxIcon name="extension" className="h-3.5 w-3.5" /> Install from the Marketplace
        </button>
        <button onClick={() => void refresh()} className="text-muted-foreground hover:text-foreground">
          Check again
        </button>
      </div>
    );
  }

  const models = status?.models ?? [];
  const canPull = status?.installed === true && !pulling && pullName.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-[12px]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${status?.serving ? "bg-primary" : "bg-muted-foreground/40"}`} />
        {status === null ? "Checking the engine…" : status.serving ? "Engine answering on 127.0.0.1:11435" : "Engine installed, starts on first run"}
      </span>
      <DropdownMenu onOpenChange={(o) => o && void refresh()}>
        <DropdownMenuTrigger asChild>
          <button aria-label="Decision model" className="flex h-7 max-w-[240px] items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-secondary">
            <span className="truncate">{model}</span>
            {models.includes(model) ? null : <span className="text-[10px] text-warning">not pulled</span>}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          {models.length === 0 ? <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No model pulled yet — pull one on the right.</div> : null}
          {models.map((m) => (
            <DropdownMenuItem key={m} onClick={() => onModel(m)} className="font-mono text-[12px]">
              {m}
              {m === model ? <Check className="ml-auto h-3 w-3" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <label className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2">
        <span className="text-muted-foreground">Pull</span>
        <input value={pullName} onChange={(e) => setPullName(e.target.value.trim())} spellCheck={false} aria-label="Model to pull" className="w-44 bg-transparent font-mono text-[11px] outline-none" />
      </label>
      <button
        onClick={() => void pull()}
        disabled={!canPull}
        title={status === null ? "Checking the engine…" : undefined}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
      >
        {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="arrow-to-bottom" className="h-3.5 w-3.5" />}
        {pulling ? "Pulling…" : "Pull model"}
      </button>
      {log ? (
        <span className="basis-full truncate font-mono text-[11px] text-muted-foreground" title={log}>
          {log}
        </span>
      ) : null}
    </div>
  );
}
