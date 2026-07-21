import { Check, Loader2, Sparkles, X } from "lucide-react";
import { CodeComparison } from "@/components/ui/code-comparison";
import { cn } from "@/lib/utils";

export type InlineDiffState = {
  action: "optimize" | "fix" | "edit";
  before: string;
  after: string | null; // null while the rewrite is still streaming in
  error?: string | null;
};

const TITLE: Record<InlineDiffState["action"], string> = {
  optimize: "Optimize",
  fix: "Fix",
  edit: "Edit",
};

/**
 * Overlay diff for an AI edit of the SQL: original vs. proposed, side by side,
 * with Accept / Decline — the git-diff review flow, in the editor. Accept
 * replaces the reviewed SQL; Decline discards the suggestion.
 */
export function InlineSqlDiff({
  state,
  onAccept,
  onDecline,
}: {
  state: InlineDiffState;
  onAccept: (next: string) => void;
  onDecline: () => void;
}) {
  const loading = state.after === null && !state.error;
  const unchanged = state.after !== null && state.after.trim() === state.before.trim();

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">{TITLE[state.action]} — review changes</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {loading ? "Generating…" : unchanged ? "No changes suggested" : "Accept to apply"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {state.error ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-destructive">{state.error}</p>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Rewriting your SQL…
            </div>
          ) : (
            <CodeComparison
              beforeCode={state.before}
              afterCode={state.after ?? state.before}
              language="sql"
              filename="query.sql"
              lightTheme="github-light"
              darkTheme="github-dark"
              highlightColor="rgba(95,195,59,0.14)"
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3.5 py-2.5">
          <button
            onClick={onDecline}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Decline
          </button>
          <button
            onClick={() => state.after && onAccept(state.after)}
            disabled={loading || !!state.error || unchanged || !state.after}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/85",
              "disabled:opacity-50",
            )}
          >
            <Check className="h-3.5 w-3.5" /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}
