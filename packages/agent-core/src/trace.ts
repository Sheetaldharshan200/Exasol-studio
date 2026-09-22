// P3 of the agentic architecture (docs/agentic-architecture-spec.md):
// run observability. Pure span logic ONLY — pairing tool start/end into
// spans, and summarizing spans into usage totals — so it is unit-tested.
// Persistence lives in trace-store.ts; emission points stay one-line hooks.

export type TraceSpan = {
  /** turn | tool | gateway | verification */
  kind: "turn" | "tool" | "gateway" | "verification";
  name: string;
  sessionId?: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  tokens?: { input?: number; output?: number };
  provider?: string;
  model?: string;
  /** Small, span-specific facts (database, rowCount, verified …). */
  meta?: Record<string, string | number | boolean>;
};

/** Pairs tool-start/tool-end events (by call id) into finished spans. */
export class ToolSpanPairer {
  private open = new Map<string, { name: string; startedAt: number }>();

  start(callId: string, name: string, at = Date.now()): void {
    this.open.set(callId, { name, startedAt: at });
    // A runaway map means missing tool-end events — cap it defensively.
    if (this.open.size > 200) {
      const oldest = this.open.keys().next().value;
      if (oldest !== undefined) this.open.delete(oldest);
    }
  }

  end(callId: string, ok: boolean, at = Date.now()): Omit<TraceSpan, "sessionId"> | null {
    const started = this.open.get(callId);
    if (!started) return null; // unmatched end — never fabricate a duration
    this.open.delete(callId);
    return {
      kind: "tool",
      name: started.name,
      startedAt: started.startedAt,
      durationMs: Math.max(0, at - started.startedAt),
      ok,
    };
  }
}

export type TraceSummary = {
  days: number;
  turns: number;
  toolCalls: number;
  gatewayCalls: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  avgToolMs: number;
  byProvider: Record<string, { turns: number; tokensIn: number; tokensOut: number }>;
  byDay: Record<string, { turns: number; toolCalls: number; tokensIn: number; tokensOut: number }>;
};

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function summarizeSpans(spans: TraceSpan[], days: number): TraceSummary {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const summary: TraceSummary = {
    days,
    turns: 0,
    toolCalls: 0,
    gatewayCalls: 0,
    failures: 0,
    tokensIn: 0,
    tokensOut: 0,
    avgToolMs: 0,
    byProvider: {},
    byDay: {},
  };
  let toolMsTotal = 0;
  for (const s of spans) {
    if (s.startedAt < cutoff) continue;
    const day = (summary.byDay[dayKey(s.startedAt)] ??= { turns: 0, toolCalls: 0, tokensIn: 0, tokensOut: 0 });
    if (!s.ok) summary.failures++;
    if (s.kind === "turn") {
      summary.turns++;
      day.turns++;
      const tin = s.tokens?.input ?? 0;
      const tout = s.tokens?.output ?? 0;
      summary.tokensIn += tin;
      summary.tokensOut += tout;
      day.tokensIn += tin;
      day.tokensOut += tout;
      if (s.provider) {
        const p = (summary.byProvider[s.provider] ??= { turns: 0, tokensIn: 0, tokensOut: 0 });
        p.turns++;
        p.tokensIn += tin;
        p.tokensOut += tout;
      }
    } else if (s.kind === "tool") {
      summary.toolCalls++;
      day.toolCalls++;
      toolMsTotal += s.durationMs;
    } else if (s.kind === "gateway") {
      summary.gatewayCalls++;
    }
  }
  summary.avgToolMs = summary.toolCalls ? Math.round(toolMsTotal / summary.toolCalls) : 0;
  return summary;
}
