/**
 * The turn as a LangGraph.js StateGraph — orchestration lives HERE, behavior
 * lives in loop.ts closures. The reliability ladder that used to be `if`
 * blocks inside a for-loop is now explicit nodes with conditional edges:
 *
 *   START → attempt ─┬→ recover ──────┬→ attempt   (text-rescue / phantom / nudge)
 *                    ├→ continuation ─┘→ attempt   (mid-plan stop resumed)
 *                    └→ finalize → END
 *
 * Hybrid by design: model calls inside the attempt node still use the Vercel
 * AI SDK (providers, streaming, deterministic tool-call repair). Durability
 * stays on Session.checkpoint/turn.json — LangGraph's SQLite checkpointer
 * needs better-sqlite3 (a native module), which would break the single-file
 * zero-native sidecar bundle; our layer is eval-tested and equivalent for
 * this product's needs. Decision record: docs/runtime-vs-langgraph.md.
 */

import { Annotation, Command, END, START, StateGraph } from "@langchain/langgraph";

export const TurnStateAnnotation = Annotation.Root({
  /** Final text of the last attempt (drives the rescue/continuation routing). */
  text: Annotation<string>({ reducer: (_prev, next) => next, default: () => "" }),
  /** Native tool calls made in the last attempt. */
  toolCalls: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  /** Token usage of the last attempt (surfaced on message-done). */
  usage: Annotation<{ inputTokens?: number; outputTokens?: number } | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type TurnGraphState = typeof TurnStateAnnotation.State;

export type TurnNodes = {
  /** One model attempt (streamText + event pumping). */
  attempt: (s: TurnGraphState) => Promise<Partial<TurnGraphState>>;
  /** Text-rescue / phantom-tool / plan-nudge; decides attempt vs finalize. */
  recover: (s: TurnGraphState) => Promise<Command>;
  /** Mid-plan stop → resumption message; always retries. */
  continuation: (s: TurnGraphState) => Promise<Command>;
  /** message-done + post-turn bookkeeping. */
  finalize: (s: TurnGraphState) => Promise<Partial<TurnGraphState>>;
  /** Conditional edge out of attempt. */
  route: (s: TurnGraphState) => "recover" | "continuation" | "finalize";
};

export function buildTurnGraph(nodes: TurnNodes) {
  return new StateGraph(TurnStateAnnotation)
    .addNode("attempt", nodes.attempt)
    .addNode("recover", nodes.recover, { ends: ["attempt", "finalize"] })
    .addNode("continuation", nodes.continuation, { ends: ["attempt"] })
    .addNode("finalize", nodes.finalize)
    .addEdge(START, "attempt")
    .addConditionalEdges("attempt", nodes.route, ["recover", "continuation", "finalize"])
    .addEdge("finalize", END)
    .compile();
}
