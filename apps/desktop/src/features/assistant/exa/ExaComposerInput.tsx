import { useMemo, useState, type ComponentProps, type KeyboardEvent } from "react";
import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { CornerDownLeft } from "lucide-react";
import { useExaComposer } from "./ExaThread";
import { schemaArguments, tableArguments } from "./context";
import { completeDraft } from "./complete-draft";

/**
 * The chat input plus a deterministic completion: slash commands, `@table`
 * names from the connection's catalog, and the user's own recent prompts.
 * The suggestion is shown as a hint line under the input; Tab accepts it,
 * Escape dismisses it for this draft, nothing here ever submits.
 */
export function ExaComposerInput(props: ComponentProps<typeof ComposerPrimitive.Input>) {
  const aui = useAui();
  const api = useExaComposer();
  const text = useAuiState((s) => s.composer.text);
  const messages = useAuiState((s) => s.thread.messages);
  const recentPrompts = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user")
        .map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim())
        .filter(Boolean)
        .reverse(),
    [messages],
  );
  const catalogNames = useMemo(() => {
    const snap = api?.getSnapshot();
    return snap ? [...schemaArguments(snap), ...tableArguments(snap)] : [];
    // The snapshot getter is cheap; re-read whenever the draft changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, text]);
  // Escape hides the suggestion for THIS draft; typing anything brings it back.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const suggested = useMemo(() => completeDraft(text, { catalogNames, recentPrompts }), [text, catalogNames, recentPrompts]);
  const completion = dismissedFor === text ? null : suggested;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && completion && !e.shiftKey) {
      e.preventDefault();
      aui.composer().setText(completion.text);
      return;
    }
    if (e.key === "Escape" && completion) {
      e.preventDefault();
      e.stopPropagation();
      setDismissedFor(text);
      return;
    }
    props.onKeyDown?.(e);
  };

  return (
    <>
      <ComposerPrimitive.Input {...props} onKeyDown={onKeyDown} />
      {completion ? (
        <div className="flex items-center gap-1.5 px-2.5 pb-1 font-mono text-[11px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border px-1 py-px text-[10px]">Tab</kbd>
          <span className="truncate">
            <span className="text-foreground/70">{text}</span>
            <span className="text-muted-foreground/70">{completion.ghost}</span>
          </span>
          {completion.kind === "recent" ? <CornerDownLeft className="ml-auto h-3 w-3 shrink-0 opacity-60" aria-label="from a recent prompt" /> : null}
        </div>
      ) : null}
    </>
  );
}
