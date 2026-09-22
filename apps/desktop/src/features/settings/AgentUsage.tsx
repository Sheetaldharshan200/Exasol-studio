// P3 (docs/agentic-architecture-spec.md): agent run observability — usage
// totals (turns, tokens by provider/day, tool latency) and the recent
// activity list, read from the agent's trace store. Read-only.

import { useEffect, useRef, useState } from "react";
import { Activity, Check, Loader2, RefreshCcw, X } from "lucide-react";
import { agent, type TraceSpanInfo, type TraceSummary } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function AgentUsage() {
  const [summary, setSummary] = useState<TraceSummary | null>(null);
  const [spans, setSpans] = useState<TraceSpanInfo[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  // A newer request always wins: switching the day window (or clicking
  // refresh) while an older request is in flight must not let the stale
  // response land after the fresh one.
  const reqSeq = useRef(0);
  const refresh = (d = days) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    Promise.all([agent.tracesSummary(d), agent.tracesRecent(40)])
      .then(([s, r]) => {
        if (reqSeq.current !== seq) return;
        setSummary(s);
        setSpans(r.spans);
      })
      .catch(() => undefined)
      .finally(() => {
        if (reqSeq.current === seq) setLoading(false);
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => refresh(days), [days]);

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-border bg-panel/60 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-foreground">{value}</div>
    </div>
  );

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "h-6 rounded-md border px-2 text-[11px]",
              days === d ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {d} days
          </button>
        ))}
        <button onClick={() => refresh()} title="Refresh" className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stat("Turns", String(summary.turns))}
            {stat("Tool calls", String(summary.toolCalls + summary.gatewayCalls))}
            {stat("Tokens in / out", `${fmtTokens(summary.tokensIn)} / ${fmtTokens(summary.tokensOut)}`)}
            {stat("Avg tool time", fmtMs(summary.avgToolMs))}
          </div>

          {Object.keys(summary.byProvider).length ? (
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-foreground">By provider</div>
              <div className="mt-1.5 overflow-hidden rounded-lg border border-border">
                {Object.entries(summary.byProvider).map(([provider, p]) => (
                  <div key={provider} className="flex items-center gap-3 border-b border-border/60 px-3 py-1.5 text-[12px] last:border-0">
                    <span className="min-w-0 flex-1 truncate text-foreground">{provider}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{p.turns} turns</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {fmtTokens(p.tokensIn)} in · {fmtTokens(p.tokensOut)} out
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="text-[12px] font-semibold text-foreground">Recent activity</div>
            {spans.length === 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> Nothing yet — ask the assistant something and the run shows up here.
              </p>
            ) : (
              <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-border [scrollbar-width:thin]">
                {spans.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[12px] last:border-0">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {s.ok ? <Check className="h-3 w-3 text-primary" /> : <X className="h-3 w-3 text-destructive" />}
                    </span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[9.5px] uppercase text-muted-foreground">{s.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
                    {s.tokens?.input || s.tokens?.output ? (
                      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                        {fmtTokens(s.tokens.input ?? 0)}/{fmtTokens(s.tokens.output ?? 0)} tok
                      </span>
                    ) : null}
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{fmtMs(s.durationMs)}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : loading ? (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading usage…
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">The agent hasn't recorded any activity yet.</p>
      )}
    </div>
  );
}
