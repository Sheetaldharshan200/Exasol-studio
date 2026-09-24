/**
 * Inline AI completion — the dim suggestion ahead of the cursor, accepted
 * with Tab.
 *
 * Three things keep it usable rather than annoying: it only asks after typing
 * stops, it only asks when a suggestion could plausibly belong at the cursor,
 * and it never shows the model's answer raw. The decisions live in
 * lib/inline-completion.ts, which is where they are tested; this file is the
 * editor plumbing around them — debounce, cancellation, and a one-entry cache
 * so re-triggering on the same text does not pay for a second call.
 */
import { type Monaco } from "@monaco-editor/react";
import { agent } from "@/lib/agent-client";
import {
  COMPLETION_SYSTEM,
  cleanCompletion,
  completionKey,
  completionPrompt,
  completionWindow,
  shouldSuggest,
} from "@/lib/inline-completion";
import { blockAt, languageLabel } from "@/lib/udf-placeholder";

type TextModel = import("monaco-editor").editor.ITextModel;
type Position = import("monaco-editor").Position;
type InlineContext = import("monaco-editor").languages.InlineCompletionContext;
type CancelToken = import("monaco-editor").CancellationToken;

export type InlineAiDeps = {
  /** Whether the user has AI completion switched on. Read per request. */
  enabled: () => boolean;
  /** Bounded `schema.table.column type` lines to ground the model, or "". */
  schemaContext: () => string;
};

/** How long typing must pause before a model is asked. */
const IDLE_MS = 350;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("cancelled"));
    }, { once: true });
  });

export function installInlineAi(monaco: Monaco, deps: InlineAiDeps): { dispose: () => void } {
  let cacheKey = "";
  let cached = "";

  const provider = monaco.languages.registerInlineCompletionsProvider("sql", {
    provideInlineCompletions: async (model: TextModel, position: Position, _context: InlineContext, token: CancelToken) => {
      if (!deps.enabled()) return { items: [] };
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const win = completionWindow(text, offset);
      if (!shouldSuggest(win.prefix, win.suffix)) return { items: [] };

      const key = completionKey(win.prefix, win.suffix);
      if (key === cacheKey) {
        return cached ? { items: [{ insertText: cached, range: rangeAt(position) }] } : { items: [] };
      }

      // Wait out the keystroke. A cancelled request costs nothing, which is
      // the point of waiting before calling rather than after.
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      try {
        await sleep(IDLE_MS, ac.signal);
      } catch {
        return { items: [] };
      }
      if (token.isCancellationRequested) return { items: [] };

      const block = blockAt(text, offset);
      const raw = await agent.complete(
        COMPLETION_SYSTEM,
        completionPrompt(win, {
          language: block ? languageLabel(block.language) : undefined,
          schema: deps.schemaContext() || undefined,
        }),
      );
      if (token.isCancellationRequested) return { items: [] };

      const suggestion = cleanCompletion(raw, win.prefix, win.suffix);
      cacheKey = key;
      cached = suggestion;
      return suggestion ? { items: [{ insertText: suggestion, range: rangeAt(position) }] } : { items: [] };
    },
    // Monaco has renamed this hook across versions and calls whichever it
    // knows: the older build asks for freeInlineCompletions, the current one
    // for disposeInlineCompletions. Missing the one it wants throws on EVERY
    // suggestion — an unhandled rejection per keystroke. Nothing needs
    // releasing either way; the items are plain objects.
    freeInlineCompletions: () => undefined,
    disposeInlineCompletions: () => undefined,
  });

  return { dispose: () => provider.dispose() };
}

/** Ghost text is inserted at the cursor, so the range is empty there. */
const rangeAt = (p: { lineNumber: number; column: number }) => ({
  startLineNumber: p.lineNumber,
  startColumn: p.column,
  endLineNumber: p.lineNumber,
  endColumn: p.column,
});
