// How a box came to be: the table it started from, every SQL step in order,
// the chart's mapping — with the compiled statement one copy away. This is
// what a person reads to verify a result and what the agent is handed when
// asked "how did we get this".

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { LineageStep } from "./model.ts";

export function lineageText(steps: LineageStep[], compiled: string | null): string {
  const lines = steps.map((s, i) => {
    if (s.kind === "table") return `${i + 1}. Table ${s.label}`;
    if (s.kind === "query") return `${i + 1}. ${s.rowsBehind ? "Rows behind a selection" : "SQL step"} "${s.label}":\n${s.sql.trim()}`;
    return `${i + 1}. Chart "${s.label}" — ${s.chart}${s.by ? ` by ${s.by}` : ""}${s.measures.length ? `, measures ${s.measures.join(", ")}` : ""}`;
  });
  return [...lines, ...(compiled ? [`Compiled SQL:\n${compiled}`] : [])].join("\n\n");
}

export function Evidence({ steps, compiled, error }: { steps: LineageStep[]; compiled: string | null; error?: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="nowheel flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-[11px]">
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[9px] font-bold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {s.kind === "table" ? (
                <div className="text-foreground">
                  Table <span className="font-mono">{s.label}</span>
                </div>
              ) : s.kind === "query" ? (
                <div>
                  <div className="text-foreground">
                    {s.rowsBehind ? "Rows behind a selection" : "SQL step"} <span className="font-semibold">{s.label}</span>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/30 p-1.5 font-mono text-[10px] leading-snug text-muted-foreground">{s.sql.trim()}</pre>
                </div>
              ) : (
                <div className="text-foreground">
                  Chart <span className="font-semibold">{s.label}</span> — {s.chart}
                  {s.by ? (
                    <>
                      {" "}
                      by <span className="font-mono">{s.by}</span>
                    </>
                  ) : null}
                  {s.measures.length ? (
                    <>
                      , measures <span className="font-mono">{s.measures.join(", ")}</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {error ? <p className="text-destructive">{error}</p> : null}
      {compiled ? (
        <div className="mt-1 border-t border-border/60 pt-2">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>Compiled SQL — what the database ran</span>
            <button onClick={() => void copy(compiled)} className="nodrag flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-primary/10">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy SQL"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/30 p-1.5 font-mono text-[10px] leading-snug text-foreground">{compiled}</pre>
        </div>
      ) : null}
      <button onClick={() => void copy(lineageText(steps, compiled))} className="nodrag mt-1 self-start rounded border border-border px-2 py-1 text-foreground hover:bg-secondary">
        Copy the whole trail
      </button>
    </div>
  );
}
