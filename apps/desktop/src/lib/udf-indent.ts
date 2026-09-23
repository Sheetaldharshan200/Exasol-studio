// How pressing Enter behaves inside a UDF body.
//
// The buffer's language is SQL, so Monaco indents by SQL's rules everywhere —
// including inside a `--/ … /` block, where the code is Python, Lua, Java or
// R. Typing a Python `if x:` and getting no indent is the moment the block
// stops feeling like writing in that language.
//
// None of those rules are written here. Monaco already ships a language
// configuration for each language it can highlight — Python's `onEnterRules`
// is Python's own rule, maintained upstream — and this reads that
// configuration rather than restating it. A language we have never heard of
// works if Monaco knows it, and when Monaco improves a language's rules we
// follow without an edit.
//
// What IS here is the generic evaluation: which of a configuration's rules
// applies to the line you just pressed Enter on.

/** The parts of Monaco's LanguageConfiguration this needs. */
export type EnterRule = {
  beforeText: RegExp;
  afterText?: RegExp;
  previousLineText?: RegExp;
  action: { indentAction: number; appendText?: string; removeText?: number };
};
export type LangConf = {
  onEnterRules?: readonly EnterRule[];
  brackets?: readonly (readonly [string, string])[];
  indentationRules?: { increaseIndentPattern?: RegExp; decreaseIndentPattern?: RegExp };
};

/** The language's own rule for this line, or null when none applies. Rules
 *  are tried in the order the language declares them, as Monaco does. */
export function matchEnterRule(
  conf: LangConf | null | undefined,
  context: { beforeText: string; afterText?: string; previousLineText?: string },
): EnterRule | null {
  for (const rule of conf?.onEnterRules ?? []) {
    if (!rule.beforeText.test(context.beforeText)) continue;
    if (rule.afterText && !rule.afterText.test(context.afterText ?? "")) continue;
    if (rule.previousLineText && !rule.previousLineText.test(context.previousLineText ?? "")) continue;
    return rule;
  }
  return null;
}

/** Does the line end inside a bracket the language declares as opening one?
 *  This is what gives Java, Lua and R their `{`/`(` behaviour — again from
 *  the language's own configuration, not from a list written here. */
export function opensBracket(conf: LangConf | null | undefined, beforeText: string): boolean {
  const trimmed = beforeText.trimEnd();
  if (!trimmed) return false;
  return (conf?.brackets ?? []).some(([open]) => open.length > 0 && trimmed.endsWith(open));
}

/** The language's indentation patterns, when it declares them. */
export function increasesIndent(conf: LangConf | null | undefined, beforeText: string): boolean {
  const pattern = conf?.indentationRules?.increaseIndentPattern;
  return pattern ? pattern.test(beforeText) : false;
}

/** The leading whitespace of a line. */
export const leadingIndent = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? "";

/** One step of indentation, in whatever the line is already using. */
export function indentUnit(line: string, tabSize: number): string {
  return leadingIndent(line).includes("\t") ? "\t" : " ".repeat(Math.max(1, tabSize));
}

/**
 * What the next line should start with. `indentActions` carries Monaco's own
 * IndentAction values, so the meaning of a rule's action comes from Monaco
 * too rather than from numbers written here.
 */
export function nextIndent(
  conf: LangConf | null | undefined,
  context: { beforeText: string; afterText?: string; previousLineText?: string },
  tabSize: number,
  indentActions: { Indent: number; Outdent: number; IndentOutdent: number },
): string {
  const current = leadingIndent(context.beforeText);
  const unit = indentUnit(context.beforeText, tabSize);
  const rule = matchEnterRule(conf, context);
  const action = rule?.action.indentAction;
  const append = rule?.action.appendText ?? "";
  if (action === indentActions.Indent || action === indentActions.IndentOutdent) return current + unit + append;
  if (action === indentActions.Outdent) return current.slice(0, Math.max(0, current.length - unit.length)) + append;
  if (rule) return current + append;
  // No explicit rule: the language's indentation patterns, then its brackets.
  if (increasesIndent(conf, context.beforeText) || opensBracket(conf, context.beforeText)) return current + unit;
  return current;
}
