import { fuzzyRank } from "../../../lib/fuzzy.ts";
import { filterCommands } from "./commands.ts";

/**
 * Ghost-text completion for the chat composer — deterministic, no model call.
 * Three sources, one suggestion: a slash command while the draft starts with
 * `/`, a catalog name while the caret is in an `@token`, otherwise the most
 * recent prompt that begins with what was typed (three characters or more).
 */
export type Completion = {
  /** The full text the draft becomes when the suggestion is accepted. */
  text: string;
  /** Only the part to paint as ghost text after the caret. */
  ghost: string;
  kind: "command" | "mention" | "recent";
};

export type CompletionSources = {
  /** `SCHEMA.TABLE` and bare `SCHEMA` names from the active connection. */
  catalogNames: string[];
  /** Newest first. */
  recentPrompts: string[];
};

export function completeDraft(draft: string, sources: CompletionSources): Completion | null {
  if (!draft) return null;
  // Slash command: only while still typing the command word.
  const slash = /^\/([\w-]*)$/.exec(draft);
  if (slash) {
    const best = filterCommands(slash[1]).find((c) => c.title.startsWith(slash[1].toLowerCase()));
    if (!best || best.title === slash[1].toLowerCase()) return null;
    const text = `/${best.title} `;
    return { text, ghost: text.slice(draft.length), kind: "command" };
  }
  // @mention: the token under the caret (the draft's tail).
  const mention = /(^|\s)@([\w.]*)$/.exec(draft);
  if (mention) {
    const typed = mention[2];
    if (typed.length === 0) return null;
    const ranked = fuzzyRank(typed, sources.catalogNames, (n) => n);
    const prefix = sources.catalogNames.filter((n) => n.toLowerCase().startsWith(typed.toLowerCase()) || n.split(".").pop()!.toLowerCase().startsWith(typed.toLowerCase()));
    const best = prefix[0] ?? ranked[0]?.item;
    if (!best || best.toLowerCase() === typed.toLowerCase()) return null;
    const text = `${draft.slice(0, draft.length - typed.length)}${best}`;
    return { text, ghost: text.slice(draft.length), kind: "mention" };
  }
  if (draft.length < 3) return null;
  const lower = draft.toLowerCase();
  const recent = sources.recentPrompts.find((p) => p.toLowerCase().startsWith(lower) && p.length > draft.length);
  if (!recent) return null;
  return { text: recent, ghost: recent.slice(draft.length), kind: "recent" };
}
