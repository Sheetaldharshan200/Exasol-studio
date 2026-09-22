// P3 trace persistence: append-only JSONL, one file per day under
// <dataDir>/traces, pruned after 30 days. Aggregation is pure (trace.ts).

import { appendFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { summarizeSpans, type TraceSpan, type TraceSummary } from "./trace.ts";

const KEEP_DAYS = 30;
// Reads are bounded: a busy gateway can write far more lines than any
// summary needs, and the whole file set must never be parsed unbounded.
const MAX_READ_SPANS = 20_000;

/** UTC day (YYYY-MM-DD) `daysAgo` days before now — matches append()'s file naming. */
function dayString(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export class TraceStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "traces");
    mkdirSync(this.dir, { recursive: true });
  }

  append(span: TraceSpan): void {
    try {
      const day = new Date(span.startedAt).toISOString().slice(0, 10);
      appendFileSync(join(this.dir, `${day}.jsonl`), JSON.stringify(span) + "\n");
    } catch {
      /* observability must never break the run it observes */
    }
  }

  /** Spans from the last `days` CALENDAR days (not last N files — files can
   *  be sparse), oldest first, capped at the most recent MAX_READ_SPANS. */
  read(days: number): TraceSpan[] {
    const cutoff = dayString(Math.max(1, days) - 1);
    const chunks: TraceSpan[][] = [];
    let total = 0;
    // Newest file first so the cap keeps the most recent spans.
    for (const file of this.files().reverse()) {
      if (file.slice(0, 10) < cutoff) break;
      const chunk: TraceSpan[] = [];
      try {
        for (const line of readFileSync(join(this.dir, file), "utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            chunk.push(JSON.parse(line) as TraceSpan);
          } catch {
            /* torn line — skip */
          }
        }
      } catch {
        /* file vanished — skip */
      }
      chunks.push(chunk);
      total += chunk.length;
      if (total >= MAX_READ_SPANS) break;
    }
    return chunks.reverse().flat().slice(-MAX_READ_SPANS);
  }

  summary(days: number): TraceSummary {
    this.prune();
    return summarizeSpans(this.read(days), days);
  }

  recent(limit: number): TraceSpan[] {
    return this.read(2).slice(-limit).reverse();
  }

  private files(): string[] {
    try {
      return readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
    } catch {
      return [];
    }
  }

  private prune(): void {
    // By calendar date, not file count — with sparse usage, count-based
    // pruning would keep arbitrarily old files alive.
    const cutoff = dayString(KEEP_DAYS);
    for (const f of this.files()) {
      if (f.slice(0, 10) >= cutoff) break;
      try {
        unlinkSync(join(this.dir, f));
      } catch {
        /* best effort */
      }
    }
  }
}
