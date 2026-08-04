/**
 * `@` context providers for the chat composer (exa-agent-v2, task 3.2). Typing
 * `@` offers Studio-native context (schema, table, editor selection, a past
 * result, a file); the chosen item becomes a chip and, at send time, a grounded
 * message part. Parsing the `@`-token and serializing a chip to the text the
 * engine receives are pure and tested here; resolving a chip's real content
 * (columns, rows, file bytes) is I/O done by the caller.
 */

export type ContextKind = "schema" | "table" | "selection" | "result" | "file";

export type ContextChip = {
  kind: ContextKind;
  /** Display label on the chip, e.g. "TESTLAB.CUSTOMERS". */
  label: string;
  /** Resolved grounding content the model sees (columns, rows preview, text). */
  content: string;
};

const PREFIX: Record<string, ContextKind> = {
  schema: "schema",
  table: "table",
  selection: "selection",
  result: "result",
  file: "file",
};

/**
 * If the caret text ends in an in-progress `@provider[ query]` token, return
 * what to offer; else null. Matches at a word boundary so an email address or
 * a mid-word `@` never triggers.
 */
export function parseAtToken(textBeforeCaret: string): { kind?: ContextKind; query: string } | null {
  const m = /(?:^|\s)@([a-z]*)(?::([^\s]*))?$/i.exec(textBeforeCaret);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const query = m[2] ?? "";
  // While still typing the provider word, offer all providers filtered by it.
  if (!(word in PREFIX)) return { query: word };
  return { kind: PREFIX[word], query };
}

/** The provider kinds whose names start with `partial` (for the menu). */
export function matchProviders(partial: string): ContextKind[] {
  const p = partial.toLowerCase();
  return (Object.keys(PREFIX) as ContextKind[]).filter((k) => k.startsWith(p));
}

/** One chip → a labeled, fenced block the model receives as grounded context. */
export function serializeChip(chip: ContextChip): string {
  return [
    `# ${chip.kind.toUpperCase()} ${chip.label}`.trim(),
    `<context type="${chip.kind}" ref="${chip.label}">`,
    chip.content.trim(),
    `</context>`,
  ].join("\n");
}

/** All chips serialized and prepended to the user's message as context. */
export function buildContextBlock(chips: readonly ContextChip[]): string {
  if (chips.length === 0) return "";
  return chips.map(serializeChip).join("\n\n") + "\n\n";
}
