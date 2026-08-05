/**
 * Exa slash commands — continue.dev's command grammar adapted to a database
 * client. Typing `/` at the start of the composer opens this menu; a command
 * either EXPANDS into a prompt with auto-attached context (kind "prompt") or
 * is handled by the panel itself (kind "local": /clear, /share).
 *
 * Pure module: commands turn (argument text, ExaSnapshot) into a prompt string
 * plus the context-provider ids to auto-attach. Resolution/attachment happens
 * in the composer via resolveContext. Tested in commands.test.ts.
 */
import type { ContextProviderId, ExaSnapshot } from "./context";

export type SlashCommandId =
  | "generate"
  | "explain"
  | "optimize"
  | "fix"
  | "review"
  | "clear"
  | "share";

export type SlashCommand = {
  id: SlashCommandId;
  /** Token typed after `/`, e.g. `/explain`. */
  title: string;
  description: string;
  /** Placeholder for the free text typed after the command, if useful. */
  hint?: string;
  kind: "prompt" | "local";
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "generate", title: "generate", description: "Write SQL from a description", hint: "what to query", kind: "prompt" },
  { id: "explain", title: "explain", description: "Explain the SQL in the active editor", kind: "prompt" },
  { id: "optimize", title: "optimize", description: "Optimize the current query for Exasol", kind: "prompt" },
  { id: "fix", title: "fix", description: "Fix the current query using the last error", hint: "what went wrong", kind: "prompt" },
  { id: "review", title: "review", description: "Review the SQL for correctness, performance & safety", kind: "prompt" },
  { id: "clear", title: "clear", description: "Start a new session", kind: "local" },
  { id: "share", title: "share", description: "Export this conversation as Markdown", kind: "local" },
];

/** Filter the command list by the text typed after `/` (case-insensitive). */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.title.includes(q) || c.description.toLowerCase().includes(q));
}

/**
 * Parse a submitted draft: `/fix the join is wrong` → {command: fix, arg: "the
 * join is wrong"}. Null when the draft isn't a slash invocation (including an
 * unknown command — that text is sent verbatim, like continue.dev).
 */
export function parseSlash(draft: string): { command: SlashCommand; arg: string } | null {
  const m = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(draft.trim());
  if (!m) return null;
  const command = SLASH_COMMANDS.find((c) => c.title === m[1].toLowerCase());
  return command ? { command, arg: (m[2] ?? "").trim() } : null;
}

export type CommandExpansion = {
  /** The prompt text sent to the engine. */
  text: string;
  /** Context providers to auto-attach (resolved by the composer; missing data is skipped). */
  providerIds: ContextProviderId[];
};

/** Expand a prompt-kind command into its engine prompt + auto-context. */
export function expandCommand(id: SlashCommandId, arg: string, snap: ExaSnapshot): CommandExpansion {
  const hasSql = snap.editorSql.trim().length > 0;
  switch (id) {
    case "generate":
      return {
        text: `Write an Exasol SQL query: ${arg || "(describe the query you need)"}. Use only tables/columns that exist in the attached schema context. Return the SQL in a single fenced sql block.`,
        providerIds: ["connection", "schema"],
      };
    case "explain":
      return {
        text: `Explain what the attached SQL does, step by step: the tables involved, the join/filter logic, and what the result represents.${arg ? ` Focus on: ${arg}` : ""}`,
        providerIds: hasSql ? ["query", "connection"] : ["connection"],
      };
    case "optimize":
      return {
        text: `Optimize the attached SQL for Exasol. Consider join order, filter pushdown, unnecessary columns, and Exasol-specific features. Explain each change, then give the full optimized query in a fenced sql block.${arg ? ` Constraint: ${arg}` : ""}`,
        providerIds: hasSql ? ["query", "schema", "connection"] : ["connection"],
      };
    case "fix":
      return {
        text: `The attached SQL is not working${arg ? ` — ${arg}` : ""}. Diagnose the problem using the attached context and give the corrected query in a fenced sql block.`,
        providerIds: hasSql ? ["query", "results", "connection"] : ["results", "connection"],
      };
    case "review":
      return {
        text: `Review the attached SQL for correctness, performance and safety (destructive statements, missing WHERE clauses, implicit casts). List findings by severity, then the improved query in a fenced sql block.${arg ? ` Pay attention to: ${arg}` : ""}`,
        providerIds: hasSql ? ["query", "schema"] : ["schema"],
      };
    // Local commands never reach expandCommand; return the arg defensively.
    case "clear":
    case "share":
      return { text: arg, providerIds: [] };
  }
}

/** Render a chat transcript as Markdown for /share. */
export function transcriptMarkdown(messages: { role: "user" | "assistant"; text: string }[], title = "Exa conversation"): string {
  const lines = [`# ${title}`, ""];
  for (const m of messages) {
    lines.push(m.role === "user" ? "## You" : "## Exa", "", m.text.trim(), "");
  }
  return lines.join("\n");
}
