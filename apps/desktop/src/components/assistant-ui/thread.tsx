"use client";

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { ThreadFollowupSuggestions } from "@/components/assistant-ui/follow-up-suggestions";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/tool-group";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { humanizeEngineError } from "@/features/assistant/exa/humanize-error";
import { stripMachineContext } from "@/features/assistant/exa/context";
import { extractDataFileNotes } from "@/features/assistant/exa/attachment-routing";
import { openLinkOrPath } from "@/lib/open-target";
import { MessageTiming } from "@/components/assistant-ui/message-timing";
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from "@/components/assistant-ui/quote";
import {
  ExaComposerChips,
  ExaComposerControls,
  ExaComposerMenus,
  ExaSendButton,
  ExaThreadSuggestions,
} from "@/features/assistant/exa/ExaThread";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
} from "react";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  ReasoningGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
// A thread with no remoteId is NEW (its engine session is only created on the
// first message) — the runtime reports it as perpetually "loading", so gate on
// identity, not isLoading, or the welcome never renders.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (s.threadListItem.remoteId == null || !s.thread.isLoading || s.threads.isLoading);

export const Thread: FC<ThreadProps> = ({ components = EMPTY_COMPONENTS }) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} />
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]:
          "color-mix(in oklab, var(--color-muted) 30%, var(--color-background))",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-3",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6",
              !isEmpty &&
                "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            <ThreadFollowupSuggestions />
            <Composer />
            <AuiIf condition={isNewChatView}>
              <div className="aui-thread-welcome-suggestions-shell min-h-19">
                <AuiIf condition={(s) => s.composer.isEmpty}>
                  {/* Studio: grouped DB suggestions (category → options). */}
                  <ExaThreadSuggestions />
                </AuiIf>
              </div>
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
      {/* Studio: select text in a reply → floating Quote button. */}
      <SelectionToolbar />
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
        How can I help you today?
      </h1>
    </div>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      {/* Studio: @-context / /-command menus float above the input. */}
      <ExaComposerMenus />
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] dark:shadow-none"
        >
          {/* Studio: a quoted reply excerpt previews above the input. */}
          <ComposerQuotePreview />
          <ComposerAttachments />
          {/* Studio: resolved @-context chips sit above the input. */}
          <ExaComposerChips />
          <ComposerPrimitive.Input
            placeholder="Send a message..."
            // data-bare: the shell already draws the box — opt out of the
            // app-wide focus border/ring so no second border appears inside.
            data-bare
            className="aui-composer-input caret-primary placeholder:text-muted-foreground/80 max-h-32 min-h-10 w-full resize-none border-0 bg-transparent px-2.5 py-1 text-base outline-none"
            rows={1}
            autoFocus
            enterKeyHint="send"
            aria-label="Message input"
          />
          <ComposerAction />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-1">
      {/* Studio: mode pill · model menu · @ button (replaces the attachment
          button — no attachment adapter is configured yet). The left group
          shrinks (min-w-0) so send/cancel never leave the panel. */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <ExaComposerControls />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate asChild>
              <TooltipIconButton
                tooltip="Voice input"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-dictate size-7 rounded-full"
                aria-label="Start voice input"
              >
                <MicIcon className="aui-composer-dictate-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation asChild>
              <TooltipIconButton
                tooltip="Stop dictation"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
                aria-label="Stop voice input"
              >
                <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          {/* Studio: submit runs the panel's expand pipeline (slash commands,
              @-context, directives) before appending to the runtime. */}
          <ExaSendButton />
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-7 rounded-full"
              aria-label="Stop generating"
              // Belt & braces: the primitive cancels through the runtime; the
              // event also aborts ENGINE-side directly and forces a resync,
              // so Stop still works when the event stream is unhealthy.
              onClick={() => window.dispatchEvent(new CustomEvent("exa:force-abort"))}
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

/** Empty running reply → dot-matrix status; streaming → pulsing dot. The
 * status label is DYNAMIC: it escalates with elapsed time, so a turn that is
 * stalled (engine down, model unreachable) says so instead of implying
 * progress forever. */
const WORKING_STAGES: { after: number; label: string }[] = [
  { after: 0, label: "Thinking" },
  { after: 5, label: "Waiting for the model to answer" },
  { after: 15, label: "Still working — larger prompts and local models take longer" },
  { after: 40, label: "No response yet — check the model connection or press Stop" },
];

const AssistantWorkingIndicator: FC = () => {
  const isEmpty = useAuiState((s) => s.message.content.length === 0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isEmpty) return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => window.clearInterval(t);
  }, [isEmpty]);
  if (isEmpty) {
    const stage = [...WORKING_STAGES].reverse().find((w) => elapsed >= w.after) ?? WORKING_STAGES[0];
    return (
      <span
        data-slot="aui_assistant-message-indicator"
        className="text-muted-foreground inline-flex items-center gap-2 align-middle"
      >
        {/* The thread is monochrome (--primary is scoped to foreground), but
            the brand mark keeps its real colors: Exasol green + ink. */}
        <BrandLoader size={22} className="text-foreground [--primary:#5fc33b]" />
        <span className="text-sm">{stage.label}</span>
      </span>
    );
  }
  return (
    <span
      data-slot="aui_assistant-message-indicator"
      className="animate-pulse font-sans"
      aria-label="Assistant is working"
    >
      {"●"}
    </span>
  );
};

/** Escalating one-line status while the engine summarizes the session —
 * honest about the fact that small local models are slow at this, and that
 * Stop is available when it drags. Negative top margin swallows the
 * inter-message gap so the line hugs the reply above it. */
const COMPACTING_STAGES: { after: number; label: string }[] = [
  { after: 0, label: "compacting context…" },
  { after: 15, label: "compacting context… local models are slow at summarizing" },
  { after: 45, label: "still compacting — a larger model would be much faster here" },
  { after: 90, label: "compaction is dragging — press Stop and switch models if you're stuck" },
];

const CompactingStatus: FC = () => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => window.clearInterval(t);
  }, []);
  const stage = [...COMPACTING_STAGES].reverse().find((w) => elapsed >= w.after) ?? COMPACTING_STAGES[0];
  return (
    <MessagePrimitive.Root data-role="assistant" className="-mt-9 flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
      {stage.label}
    </MessagePrimitive.Root>
  );
};

const MessageError: FC = () => {
  // Raw engine errors ("Token refresh failed: 401") become instructions a
  // person can act on; anything unmapped shows verbatim. The original text
  // stays one disclosure away for bug reports.
  const raw = useAuiState((s) => {
    const status = s.message.role === "assistant" ? s.message.status : undefined;
    const err = (status as { error?: unknown } | undefined)?.error;
    return typeof err === "string" ? err : err instanceof Error ? err.message : undefined;
  });
  const friendly = humanizeEngineError(raw);
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        {friendly ? (
          <div className="space-y-1">
            <p className="font-medium">{friendly.title}</p>
            <p className="text-[12.5px] opacity-90">{friendly.action}</p>
            {raw ? (
              <details className="text-[11px] opacity-70">
                <summary className="cursor-pointer select-none">Details</summary>
                <p className="mt-1 break-words font-mono">{raw}</p>
              </details>
            ) : null}
          </div>
        ) : (
          <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
        )}
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

/**
 * ONE disclosure for the whole work phase: reasoning bursts and tool calls
 * between the user's message and the final answer collapse into a single
 * "Worked · N steps" row (auto-open while running, collapsed when done) —
 * instead of a noisy stack of alternating "Reasoning"/"1 tool call" headers.
 */
const ChainOfThoughtGroup: FC<PropsWithChildren<{ part: ThreadGroupPart }>> = ({ part, children }) => {
  const running = part.status.type === "running";
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? running;
  // Count only the meaningful work (reasoning + tool calls) — the group also
  // swallows step-boundary data markers, which render nothing.
  const steps = useAuiState(
    (s) =>
      part.indices.filter((i) => {
        const t = s.message.content[i]?.type;
        return t === "reasoning" || t === "tool-call";
      }).length,
  );
  if (steps === 0) return <>{children}</>;
  return (
    <div data-slot="aui_chain-of-thought" className="mb-3">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[12.5px] transition-colors"
      >
        <BrainIcon className={cn("size-3.5", running && "animate-pulse")} />
        <span>{running ? "Working" : `Worked · ${steps} step${steps === 1 ? "" : "s"}`}</span>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {open ? <div className="border-border/60 mt-2 space-y-1 border-s ps-3">{children}</div> : null}
    </div>
  );
};

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ReasoningGroup,
  } = useContext(ThreadComponentsContext);
  // Engine-side context compaction produces an assistant "summary" message
  // (mode: "compaction"). It's bookkeeping, not an answer — show a tiny
  // status only WHILE it runs; once done it vanishes and the flow continues.
  const isCompaction = useAuiState(
    (s) => (s.message.metadata?.custom as { mode?: string } | undefined)?.mode === "compaction",
  );
  const isRunning = useAuiState((s) => s.message.status?.type === "running");
  if (isCompaction) {
    if (!isRunning) return null;
    return <CompactingStatus />;
  }

  const ACTION_BAR_PT = "pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            // Step boundaries arrive as data parts (opencode-step-start /
            // -finish, rendering null); unmapped types SPLIT consecutive
            // groups — without this the work phase fractures into one
            // "Worked" disclosure per engine step.
            data: ["group-chainOfThought"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <ChainOfThoughtGroup part={part}>{children}</ChainOfThoughtGroup>;
              case "group-tool":
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>;
                }
                return (
                  <ToolGroupRoot variant="ghost">
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
              case "group-reasoning": {
                if (ReasoningGroup) {
                  return (
                    <ReasoningGroup group={part}>{children}</ReasoningGroup>
                  );
                }
                const running = part.status.type === "running";
                return (
                  <ReasoningRoot streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                return <MarkdownText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return part.dataRendererUI;
              case "indicator":
                return <AssistantWorkingIndicator />;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <AssistantReloadButton />
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <MessageTiming />
    </ActionBarPrimitive.Root>
  );
};

/**
 * User text with the machine context stripped: directives and @-chip context
 * ride inside an <exa_context> block in the SAME text part (the runtime has
 * no hidden-part channel), so the bubble renders only what the user typed.
 */
const UserMessageText: FC = () => {
  const text = useAuiState((s) => (s.part.type === "text" ? s.part.text : ""));
  const visible = stripMachineContext(text);
  if (!visible) return null;
  // URLs and absolute file paths become brand-colored click-to-open targets
  // (browser for links, a workspace tab for files).
  const segments = visible.split(/(https?:\/\/[^\s]+|(?:^|(?<=\s))(?:\/|~\/)[\w.\-/]+)/g);
  return (
    <span className="whitespace-pre-wrap">
      {segments.map((seg, i) =>
        /^https?:\/\//.test(seg) || /^(\/|~\/)[\w.\-/]+$/.test(seg) ? (
          <button
            key={i}
            type="button"
            onClick={() => openLinkOrPath(seg)}
            className="inline cursor-pointer text-[#5FC33B] underline underline-offset-2 hover:text-[#5FC33B]/80"
          >
            {seg}
          </button>
        ) : (
          seg
        ),
      )}
    </span>
  );
};

/**
 * Pins for disk-routed data files (CSV/Parquet/…): their attachment became a
 * sentinel-hidden path note in the message text, so the stock attachment row
 * has nothing to show. Recover the notes from the raw text and render one
 * clickable pin per file — click opens the saved file in a workspace tab, so
 * the user can verify exactly what was uploaded. Survives reloads: the notes
 * live in the message itself.
 */
const UserMessageFilePins: FC = () => {
  // Select a STRING (value-compared), parse in a memo — an array selector
  // would return a fresh reference per store change and re-render forever.
  const text = useAuiState((s) =>
    (s.message.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("\n"),
  );
  const notes = useMemo(() => extractDataFileNotes(text), [text]);
  if (notes.length === 0) return null;
  return (
    // One horizontal row, scrollable when the files outgrow the bubble width —
    // same idiom as the composer's attachment strip, never a stacked pile.
    <div className="col-start-2 flex max-w-full flex-row items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      {notes.map((n) => (
        <button
          key={n.path}
          type="button"
          onClick={() => openLinkOrPath(n.path)}
          title={`${n.path} — open in a tab`}
          className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2 py-1 text-left hover:bg-muted"
        >
          <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate text-[11.5px] text-foreground">{n.name}</span>
            <span className="block text-[10px] text-muted-foreground">{n.size}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

const UserMessage: FC = () => {
  // The engine's synthetic post-compaction follow-up ("Continue if you have
  // next steps…") is machine chatter, never something the user typed — hide it.
  const isSyntheticContinue = useAuiState((s) => {
    const oc = (s.message.metadata?.custom as { opencode?: { parts?: { metadata?: { compaction_continue?: boolean } }[] } } | undefined)
      ?.opencode;
    return Boolean(oc?.parts?.some((part) => part?.metadata?.compaction_continue));
  });
  if (isSyntheticContinue) return null;
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />
      <UserMessageFilePins />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          {/* Studio: a quoted excerpt renders above the message text. */}
          <MessagePrimitive.Quote>
            {(quote) => <QuoteBlock {...quote} />}
          </MessagePrimitive.Quote>
          <MessagePrimitive.Parts components={{ Text: UserMessageText }} />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

/**
 * Reload that actually regenerates: the runtime's Reload primitive only
 * reverts (the reply lingers and nothing reruns). This clears the turn by
 * reverting to the preceding user message engine-side and resends the SAME
 * prompt — the reply disappears and regenerates like a fresh turn.
 */
const AssistantReloadButton: FC = () => {
  // SCALAR selectors only: an object-returning selector creates a fresh
  // reference every run, which useSyncExternalStore treats as a permanent
  // change — an infinite re-render loop (React #185).
  const parentId = useAuiState((s) => {
    const msgs = s.thread.messages;
    const i = msgs.findIndex((m) => m.id === s.message.id);
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === "user") return msgs[j].id;
    }
    return null;
  });
  const parentText = useAuiState((s) => {
    const msgs = s.thread.messages;
    const i = msgs.findIndex((m) => m.id === s.message.id);
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === "user") {
        return msgs[j].content
          .map((p) => (p.type === "text" ? p.text : ""))
          .filter(Boolean)
          .join("\n");
      }
    }
    return null;
  });
  if (!parentId) return null;
  return (
    <TooltipIconButton
      tooltip="Regenerate — reruns your last prompt"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("exa:reload-message", { detail: { parentId, text: parentText ?? "" } }),
        )
      }
    >
      <RefreshCwIcon />
    </TooltipIconButton>
  );
};

const UserActionBar: FC = () => {
  // Copy must strip the machine context (the primitive copies RAW message
  // text, which would leak the hidden directives to the clipboard).
  const [copied, setCopied] = useState(false);
  const messageId = useAuiState((s) => s.message.id);
  // Edit = rewind-to-here; offering it mid-history invites accidental loss
  // of everything after, so it renders on the LAST user message only.
  const isLastUser = useAuiState((s) => {
    const msgs = s.thread.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") return msgs[i].id === s.message.id;
    }
    return false;
  });
  const text = useAuiState((s) =>
    s.message.content
      .map((p) => (p.type === "text" ? stripMachineContext(p.text) : ""))
      .filter(Boolean)
      .join("\n"),
  );
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end gap-0.5"
    >
      <TooltipIconButton
        tooltip="Copy"
        className="aui-user-action-copy"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>
      {/* Edit = engine-side revert to this message + prefill the composer
          with its text (the opencode runtime has no native message-edit;
          revert-and-resend is the engine's own edit semantics). */}
      {isLastUser ? (
        <TooltipIconButton
          tooltip="Edit — rewinds the conversation to this message"
          className="aui-user-action-edit"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("exa:edit-message", { detail: { messageId, text } }),
            )
          }
        >
          <PencilIcon />
        </TooltipIconButton>
      ) : null}
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        <ComposerPrimitive.Input
          // data-bare: the edit shell draws the box; skip the global focus ring.
          data-bare
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3.5"
            >
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

