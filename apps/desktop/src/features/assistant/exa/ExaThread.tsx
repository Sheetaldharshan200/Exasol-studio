import { useEffect, useMemo, useRef } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  BranchPickerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { ArrowDown, Check, ChevronLeft, ChevronRight, Copy, Database, Loader2, Sparkles, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/components/studio/AgentMark";
import { ChatMarkdown } from "./ChatMarkdown";

/**
 * The Exa message thread — assistant-ui's thread grammar (external-store
 * runtime) styled in Studio's design language: a centered thread column,
 * avatar-led assistant turns with a hover action bar (copy) and branch picker,
 * bubble user turns, welcome cards, smart auto-scroll + scroll-to-bottom pill.
 * Our ChatMarkdown renders text parts; tool calls render inline where they ran.
 */

/** The panel's message model: ordered parts, so tool calls sit inline. */
export type ExaPart =
  | { type: "text"; text: string }
  | { type: "tool"; callId: string; name: string; ok?: boolean };
export type ExaMessage = { role: "user" | "assistant"; parts: ExaPart[] };

/** Plain text of a message (for /share and copy) — tool calls become lines. */
export function messageText(m: ExaMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : `\n> tool: ${p.name}${p.ok === false ? " (failed)" : ""}\n`))
    .join("")
    .trim();
}

function toThreadMessage(m: ExaMessage): ThreadMessageLike {
  return {
    role: m.role,
    content: m.parts.map((p) =>
      p.type === "text"
        ? ({ type: "text", text: p.text } as const)
        : ({ type: "tool-call", toolName: p.name, toolCallId: p.callId, result: p.ok === undefined ? undefined : { ok: p.ok } } as const),
    ),
  };
}

const SUGGESTIONS = [
  { icon: Database, label: "Explain my schema", detail: "What lives in this database", prompt: "Give me an overview of the schemas and tables in this database." },
  { icon: Sparkles, label: "/generate", detail: "Write SQL from a description", prompt: "/generate " },
  { icon: Zap, label: "/optimize", detail: "Speed up the current query", prompt: "/optimize" },
  { icon: Wrench, label: "/fix", detail: "Debug the query that failed", prompt: "/fix" },
];

export function ExaThread({
  messages,
  busy,
  onApplySql,
  onSendText,
  onCancel,
}: {
  messages: ExaMessage[];
  busy: boolean;
  onApplySql?: (sql: string) => void;
  /** Send plain text (suggestion pills / edited messages re-enter the normal flow). */
  onSendText: (text: string) => void;
  onCancel: () => void;
}) {
  // Latest handlers behind stable refs, so message component types never
  // change identity (a new component type would remount every message).
  const applyRef = useRef(onApplySql);
  const sendRef = useRef(onSendText);
  useEffect(() => {
    applyRef.current = onApplySql;
    sendRef.current = onSendText;
  });

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: busy,
    convertMessage: toThreadMessage,
    onNew: async (m: AppendMessage) => {
      const text = m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
      if (text.trim()) sendRef.current(text);
    },
    onCancel: async () => onCancel(),
  });

  // Stable component types (created once) — handlers flow through the refs.
  const { UserMessage, AssistantMessage } = useMemo(() => {
    const partComponents = {
      Text: ({ text }: { text: string }) => <ChatMarkdown text={text} onApplySql={(sql) => applyRef.current?.(sql)} />,
      ToolFallback: ({ toolName, result }: { toolName: string; result?: unknown }) => {
        const done = result !== undefined;
        const ok = done ? (result as { ok?: boolean })?.ok !== false : undefined;
        return (
          <div className="my-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-border bg-panel px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {!done ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wrench className={cn("h-3 w-3", ok ? "text-primary" : "text-destructive")} />}
            {toolName}
            {done ? <span className={cn("text-[9px] font-semibold uppercase", ok ? "text-primary" : "text-destructive")}>{ok ? "done" : "failed"}</span> : null}
          </div>
        );
      },
    };

    function BranchPicker() {
      return (
        <BranchPickerPrimitive.Root hideWhenSingleBranch className="flex items-center gap-0.5 text-[10.5px] text-muted-foreground">
          <BranchPickerPrimitive.Previous asChild>
            <button type="button" className="rounded p-0.5 hover:bg-secondary hover:text-foreground" aria-label="Previous branch">
              <ChevronLeft className="h-3 w-3" />
            </button>
          </BranchPickerPrimitive.Previous>
          <span className="font-mono">
            <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
          </span>
          <BranchPickerPrimitive.Next asChild>
            <button type="button" className="rounded p-0.5 hover:bg-secondary hover:text-foreground" aria-label="Next branch">
              <ChevronRight className="h-3 w-3" />
            </button>
          </BranchPickerPrimitive.Next>
        </BranchPickerPrimitive.Root>
      );
    }

    function UserMessage() {
      return (
        <MessagePrimitive.Root className="group mb-4 flex w-full flex-col items-end">
          <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-[12.5px] leading-relaxed text-foreground">
            <MessagePrimitive.Parts />
          </div>
          <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <BranchPicker />
          </div>
        </MessagePrimitive.Root>
      );
    }

    function AssistantMessage() {
      return (
        <MessagePrimitive.Root className="group mb-4 flex w-full gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/5">
            <AgentMark className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] leading-relaxed">
              <MessagePrimitive.Parts components={partComponents} />
            </div>
            <ActionBarPrimitive.Root
              hideWhenRunning
              autohide="not-last"
              className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[floating]:opacity-100"
            >
              <ActionBarPrimitive.Copy asChild copiedDuration={1400}>
                <button
                  type="button"
                  title="Copy reply"
                  aria-label="Copy reply"
                  className="group/copy flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Copy className="h-3 w-3 group-data-[copied]/copy:hidden" />
                  <Check className="hidden h-3 w-3 text-primary group-data-[copied]/copy:block" />
                </button>
              </ActionBarPrimitive.Copy>
              <BranchPicker />
            </ActionBarPrimitive.Root>
          </div>
        </MessagePrimitive.Root>
      );
    }

    return { UserMessage, AssistantMessage };
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-3 [scrollbar-width:thin]">
          <div className="mx-auto w-full max-w-[44rem]">
            {messages.length === 0 ? (
              <div className="mt-8 flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
                  <AgentMark className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Ask Exa about your database</p>
                  <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">
                    Grounded in your live schema. <span className="font-mono text-primary">@</span> attaches context,{" "}
                    <span className="font-mono text-primary">/</span> runs commands.
                  </p>
                </div>
                <div className="grid w-full max-w-md grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => onSendText(s.prompt)}
                      className="group flex flex-col items-start gap-0.5 rounded-xl border border-border bg-panel px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                        <s.icon className="h-3.5 w-3.5 text-primary" /> {s.label}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">{s.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            {busy && messages[messages.length - 1]?.role === "user" ? (
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/5">
                  <AgentMark className="h-3.5 w-3.5" active />
                </div>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:240ms]" />
                </span>
              </div>
            ) : null}
          </div>
          <ThreadPrimitive.ScrollToBottom asChild>
            <button
              type="button"
              title="Scroll to latest"
              className="sticky bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground shadow-lg transition-colors hover:border-primary/40 hover:text-foreground disabled:hidden"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
