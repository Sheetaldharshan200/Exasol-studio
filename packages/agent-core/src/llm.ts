/**
 * The model I/O layer on LangChain — one ecosystem end to end (LangGraph
 * orchestrates, LangChain talks to models). This module provides the small,
 * typed surface the rest of agent-core uses:
 *
 *   tool()/ToolSet   — our tool shape (zod schema + execute), same call sites
 *   runLoop()        — the agentic step loop: bindTools → stream/invoke →
 *                      execute tool calls (in parallel) → ToolMessage → repeat
 *   generateText()   — non-streaming convenience over runLoop (compaction,
 *                      KB annotation, researchers)
 *
 * The reliability layer is BUILT IN here, not bolted on: unknown tool names
 * resolve through the alias table, malformed/aliased arguments repair
 * deterministically, and unparseable calls (LangChain's invalid_tool_calls)
 * go through the same pipeline — replacing the AI SDK's experimental
 * repairToolCall hook with something we fully own.
 */

import { AIMessage, AIMessageChunk, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool as lcTool } from "@langchain/core/tools";
import type { z } from "zod";
import { parseLooseArgs, repairArgs, rescueTextCalls, resolveToolName, zodSchemaish } from "./tool-repair.ts";
import { log } from "./log.ts";

// ── tool shape (drop-in for the ai package's tool()/ToolSet) ────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentTool<S extends z.ZodType = z.ZodType<any>> = {
  description: string;
  inputSchema: S;
  execute?: (args: z.infer<S>, opts: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, AgentTool<any>>;

/** Identity helper that preserves zod → argument type inference (ai parity). */
export function tool<S extends z.ZodType>(def: AgentTool<S>): AgentTool<S> {
  return def;
}

export type LlmUsage = { inputTokens?: number; outputTokens?: number };

/** Progress events the loop surfaces (the caller maps them to SSE/CLI). */
export type LoopEvent =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; text: string }
  | { type: "tool-input-start"; id: string; toolName: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool-error"; toolCallId: string; toolName: string; error: string };

export type LoopResult = {
  text: string;
  toolCallCount: number;
  stepCount: number;
  usage: LlmUsage;
  /** Every message this run produced (assistant + tool), in order. */
  newMessages: BaseMessage[];
};

/** Plain text from a (possibly multi-part) LangChain message content. */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  }
  return "";
}

type RunLoopOpts = {
  model: BaseChatModel;
  system?: string;
  messages: BaseMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  /** Stream token deltas (attempt node); false = invoke per step. */
  stream?: boolean;
  onEvent?: (e: LoopEvent) => void;
  /** After each step, the CUMULATIVE new messages (for checkpointing). */
  onStepFinish?: (info: { newMessages: BaseMessage[] }) => void;
};

/** The agentic step loop: model ⇄ tools until no more calls or maxSteps. */
export async function runLoop(opts: RunLoopOpts): Promise<LoopResult> {
  const { model, system, tools = {}, abortSignal, onEvent } = opts;
  const maxSteps = Math.max(1, opts.maxSteps ?? 1);
  // Tools are re-bound EVERY step from the live `tools` object, so a tool that
  // adds entries mid-turn (request_tools — on-demand tool loading) takes
  // effect on the very next step. LangChain converts the zod schemas;
  // execution stays OURS (the bound functions are never invoked).
  let boundCount = -1;
  let bound: typeof model = model;
  const rebind = () => {
    const names = Object.keys(tools);
    if (names.length === boundCount) return; // unchanged → keep the binding
    boundCount = names.length;
    const bindDefs = names.map((name) =>
      lcTool(async () => "", { name, description: tools[name].description, schema: tools[name].inputSchema }),
    );
    bound = bindDefs.length && model.bindTools ? (model.bindTools(bindDefs) as typeof model) : model;
  };
  rebind();
  // NOTE: computed live where used — the set can grow mid-turn (request_tools).

  const base: BaseMessage[] = system ? [new SystemMessage(system), ...opts.messages] : [...opts.messages];
  const produced: BaseMessage[] = [];
  const usage: LlmUsage = {};
  let text = "";
  let toolCallCount = 0;
  let step = 0;
  let rescuedOnce = false;

  const throwIfAborted = () => {
    if (abortSignal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
  };

  for (; step < maxSteps; step++) {
    throwIfAborted();
    rebind();
    let ai: AIMessageChunk | AIMessage;
    if (opts.stream) {
      let acc: AIMessageChunk | null = null;
      let announcedText = false;
      const announcedCalls = new Set<string>();
      const streamId = `s${step}`;
      const stream = await bound.stream(base.concat(produced), { signal: abortSignal });
      for await (const chunk of stream) {
        acc = acc ? acc.concat(chunk) : chunk;
        const delta = contentText(chunk.content);
        if (delta) {
          if (!announcedText) {
            announcedText = true;
            onEvent?.({ type: "text-start", id: streamId });
          }
          onEvent?.({ type: "text-delta", id: streamId, text: delta });
        }
        for (const tc of chunk.tool_call_chunks ?? []) {
          const key = tc.id ?? tc.name ?? "?";
          if (tc.name && !announcedCalls.has(key)) {
            announcedCalls.add(key);
            onEvent?.({ type: "tool-input-start", id: key, toolName: tc.name });
          }
        }
      }
      if (!acc) break;
      ai = acc;
    } else {
      ai = (await bound.invoke(base.concat(produced), { signal: abortSignal })) as AIMessage;
    }

    const um = (ai as AIMessage).usage_metadata;
    if (um) {
      usage.inputTokens = (usage.inputTokens ?? 0) + (um.input_tokens ?? 0);
      usage.outputTokens = (usage.outputTokens ?? 0) + (um.output_tokens ?? 0);
    }
    produced.push(ai);
    const stepText = contentText(ai.content);
    if (stepText) text = stepText; // the LAST text block is the answer

    // Collect calls: valid ones as-is; unparseable ones go through the same
    // deterministic repair pipeline the AI SDK hook used to run.
    type Call = { id: string; name: string; args: Record<string, unknown> };
    const calls: Call[] = [];
    for (const tc of (ai as AIMessage).tool_calls ?? []) {
      calls.push({ id: tc.id ?? `c${step}-${calls.length}`, name: tc.name, args: (tc.args ?? {}) as Record<string, unknown> });
    }
    for (const bad of (ai as AIMessage).invalid_tool_calls ?? []) {
      const parsed = parseLooseArgs(bad.args);
      if (bad.name && parsed !== null) {
        calls.push({ id: bad.id ?? `c${step}-${calls.length}`, name: bad.name, args: parsed });
        log.info("invalid tool call repaired", { tool: bad.name });
      }
    }
    // Prose-only turn: small models sometimes NARRATE their tool use (fake
    // CALL IMPORT_CSV(...) statements, a JSON dashboard spec they "show"
    // instead of saving). Rescue recognizable intents into real calls — once
    // per run, so a stubborn model can't loop forever.
    if (!calls.length && stepText && !rescuedOnce) {
      const rescued = rescueTextCalls(stepText).filter((r) => Object.keys(tools).includes(r.name));
      if (rescued.length) {
        rescuedOnce = true;
        for (const r of rescued) calls.push({ id: `rescue-${step}-${calls.length}`, name: r.name, args: r.args });
        log.info("rescued narrated tool calls", { names: rescued.map((r) => r.name) });
        // Keep the transcript consistent: the assistant message must carry the
        // tool_calls that the ToolMessages below answer.
        produced[produced.length - 1] = new AIMessage({
          content: ai.content,
          tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args, type: "tool_call" as const })),
        });
      }
    }
    if (!calls.length) break; // finished — no more tool work

    // Repair + execute ALL calls in parallel (AI SDK parity), each producing
    // a ToolMessage so the model sees real results (or actionable errors).
    const results = await Promise.all(
      calls.map(async (call): Promise<ToolMessage> => {
        const resolved = resolveToolName(call.name, Object.keys(tools));
        if (!resolved) {
          onEvent?.({ type: "tool-error", toolCallId: call.id, toolName: call.name, error: "no such tool" });
          return new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: `No tool named "${call.name}" exists. Available tools: ${Object.keys(tools).join(", ")}. Use one of those.`,
          });
        }
        const def = tools[resolved];
        if (resolved !== call.name) log.info("tool call repaired", { from: call.name, to: resolved });
        // Aliased/mistyped argument keys → canonical, without inventing values.
        const schemaish = zodSchemaish(def.inputSchema);
        const repaired = schemaish ? (repairArgs(call.args, schemaish) ?? call.args) : call.args;
        const valid = def.inputSchema.safeParse(repaired);
        const args = valid.success ? (valid.data as Record<string, unknown>) : repaired;
        toolCallCount++;
        onEvent?.({ type: "tool-call", toolCallId: call.id, toolName: resolved, input: args });
        if (!valid.success) {
          const issue = valid.error.issues[0];
          const msg = `Invalid arguments for ${resolved}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}. Fix the arguments and call it again.`;
          onEvent?.({ type: "tool-error", toolCallId: call.id, toolName: resolved, error: msg });
          return new ToolMessage({ tool_call_id: call.id, name: resolved, content: msg });
        }
        try {
          const output = typeof def.execute === "function" ? await def.execute(args, { toolCallId: call.id, messages: [] }) : { error: "tool has no execute" };
          onEvent?.({ type: "tool-result", toolCallId: call.id, toolName: resolved, output });
          return new ToolMessage({ tool_call_id: call.id, name: resolved, content: JSON.stringify(output ?? null) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          onEvent?.({ type: "tool-error", toolCallId: call.id, toolName: resolved, error: msg });
          return new ToolMessage({ tool_call_id: call.id, name: resolved, content: `Error: ${msg}` });
        }
      }),
    );
    produced.push(...results);
    opts.onStepFinish?.({ newMessages: [...produced] });
  }

  opts.onStepFinish?.({ newMessages: [...produced] });
  return { text, toolCallCount, stepCount: step + 1, usage, newMessages: produced };
}

/** Non-streaming convenience (compaction, KB annotation, researchers). */
export async function generateText(opts: {
  model: BaseChatModel;
  system?: string;
  prompt?: string;
  messages?: BaseMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onEvent?: (e: LoopEvent) => void;
}): Promise<{ text: string; stepCount: number; toolCallCount: number }> {
  const { HumanMessage } = await import("@langchain/core/messages");
  const messages = opts.messages ?? (opts.prompt !== undefined ? [new HumanMessage(opts.prompt)] : []);
  const res = await runLoop({
    model: opts.model,
    system: opts.system,
    messages,
    tools: opts.tools,
    maxSteps: opts.maxSteps ?? 1,
    abortSignal: opts.abortSignal,
    stream: false,
    onEvent: opts.onEvent,
  });
  return { text: res.text, stepCount: res.stepCount, toolCallCount: res.toolCallCount };
}
