/**
 * Caret completion on the Exasol grammar via antlr4-c3 (Phase 5).
 *
 * Wire-up once `npm run generate` has produced src/generated/* (needs Java):
 *
 *   const lexer = new ExasolLexer(CharStream.fromString(sql));
 *   const parser = new ExasolParser(new CommonTokenStream(lexer));
 *   parser.program();
 *   const core = new CodeCompletionCore(parser);
 *   core.preferredRules = new Set([
 *     ExasolParser.RULE_schemaName, ExasolParser.RULE_tableName,
 *     ExasolParser.RULE_columnName, ExasolParser.RULE_functionName,
 *   ]);
 *   const candidates = core.collectCandidates(caretTokenIndex);
 *
 * `candidates.rules` → which ENTITY kind belongs at the caret;
 * `candidates.tokens` → exactly the keywords that are grammatically valid.
 * The consumer (Studio's sql-completion.ts) maps kinds to its live catalog.
 */

export type ExasolSuggestions = {
  /** Entity kinds valid at the caret. */
  kinds: ("schema" | "table" | "column" | "function")[];
  /** Grammar-valid keywords at the caret. */
  keywords: string[];
};

export function getSuggestions(_sql: string, _caret: { line: number; column: number }): ExasolSuggestions {
  // TODO(Phase 5): implement over src/generated parser — see header.
  throw new Error("Run `npm run generate` first (Phase 0 codegen requires Java ≥11), then implement per TASKS.md Phase 5.");
}
