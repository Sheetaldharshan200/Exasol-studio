import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { ArrowDown, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/components/studio/AgentMark";
import { ChatMarkdown } from "./ChatMarkdown";

/**
 * The Exa message thread — assistant-ui primitives (external-store runtime)
 * over the panel's own message state. assistant-ui provides the demo-grade
 * thread mechanics (smart auto-scroll, scroll-to-bottom, per-part rendering);
 * Studio provides the look: our ChatMarkdown for text, our tool cards for
 * tool calls, the AgentMark welcome, and suggestion pills.
 */

/** The panel's message model: ordered parts, so tool calls sit inline. */
export type ExaPart =
  | { type: "text"; text: string }
  | { type: "tool"; callId: string; name: string; ok?: boolean };
export type ExaMessage = { role: "user" | "assistant"; parts: ExaPart[] };

/** Plain text of a message (for /share and copy). */
export function messageText(m: ExaMessage): string {
  return m.parts.filter((p): p is Extract<ExaPart, { type: "text" }> => p.type === "text").map((p) => p.text).join("");
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
  { label: "Explain my schema", prompt: "Give me an overview of the schemas and tables in this database." },
  { label: "/explain", prompt: "/explain" },
  { label: "/optimize", prompt: "/optimize" },
  { label: "Find slow queries", prompt: "Which of my recent queries were slowest, and why?" },
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
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: busy,
    convertMessage: toThreadMessage,
    onNew: async (m: AppendMessage) => {
      const text = m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
      if (text.trim()) onSendText(text);
    },
    onCancel: async () => onCancel(),
  });

  // Part renderers close over onApplySql; memoized so the tree stays stable.
  const partComponents = useMemo(
    () => ({
      Text: ({ text }: { text: string }) => <ChatMarkdown text={text} onApplySql={onApplySql} />,
      ToolFallback: ({ toolName, result }: { toolName: string; result?: unknown }) => {
        const done = result !== undefined;
        const ok = done ? (result as { ok?: boolean })?.ok !== false : undefined;
        return (
          <div className="my-1 flex items-center gap-1.5 rounded-md border border-border bg-editor px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {!done ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wrench className={cn("h-3 w-3", ok ? "text-primary" : "text-destructive")} />}
            {toolName}
          </div>
        );
      },
    }),
    [onApplySql],
  );

  const UserMessage = useMemo(
    () =>
      function UserMessage() {
        return (
          <MessagePrimitive.Root className="mb-3 flex justify-end">
            <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
              <MessagePrimitive.Parts />
            </div>
          </MessagePrimitive.Root>
        );
      },
    [],
  );

  const AssistantMessage = useMemo(
    () =>
      function AssistantMessage() {
        return (
          <MessagePrimitive.Root className="mb-3 flex">
            <div className="max-w-[97%] rounded-lg bg-editor px-3 py-2">
              <MessagePrimitive.Parts components={partComponents} />
            </div>
          </MessagePrimitive.Root>
        );
      },
    [partComponents],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="relative min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
          {messages.length === 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <AgentMark className="h-9 w-9" />
              <div>
                <p className="text-[13px] font-semibold text-foreground">Ask Exa about your database</p>
                <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">
                  Grounded in your live schema. Type <span className="font-mono text-primary">@</span> to attach context,{" "}
                  <span className="font-mono text-primary">/</span> for commands.
                </p>
              </div>
              <div className="mt-1 flex max-w-sm flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onSendText(s.prompt)}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          {busy && messages[messages.length - 1]?.role === "user" ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> thinking…
            </div>
          ) : null}
          <ThreadPrimitive.ScrollToBottom asChild>
            <button
              type="button"
              title="Scroll to latest"
              className="sticky bottom-2 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground shadow-md transition-colors hover:text-foreground disabled:hidden"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
