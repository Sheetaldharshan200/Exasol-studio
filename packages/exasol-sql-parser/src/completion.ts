/**
 * Caret completion on the true Exasol grammar via antlr4-c3 (Phase 5 v0).
 * `candidates.rules` → which ENTITY kind belongs at the caret;
 * `candidates.tokens` → exactly the keywords that are grammatically valid.
 * The consumer (Studio's sql-completion.ts) maps kinds onto its live catalog.
 */

import { CharStream, CommonTokenStream } from "antlr4ng";
import { CodeCompletionCore } from "antlr4-c3";
import { ExasolLexer } from "./generated/ExasolLexer.ts";
import { ExasolParser } from "./generated/ExasolParser.ts";

export type ExasolSuggestions = {
  /** Entity kinds valid at the caret. */
  kinds: ("schema" | "table" | "column" | "function")[];
  /** Grammar-valid keywords at the caret (uppercase). */
  keywords: string[];
  /** Syntax errors seen while parsing (empty = clean parse). */
  errors: number;
};

const RULE_KINDS: [string, ExasolSuggestions["kinds"][number]][] = [
  ["RULE_schemaName", "schema"],
  ["RULE_tableName", "table"],
  ["RULE_columnName", "column"],
  ["RULE_functionName", "function"],
];

/** 1-based line, 0-based column (Monaco: column - 1). */
export function getSuggestions(sql: string, caret: { line: number; column: number }): ExasolSuggestions {
  const lexer = new ExasolLexer(CharStream.fromString(sql));
  lexer.removeErrorListeners();
  const tokens = new CommonTokenStream(lexer);
  const parser = new ExasolParser(tokens);
  parser.removeErrorListeners();
  let errors = 0;
  parser.addErrorListener({
    syntaxError: () => {
      errors++;
    },
  } as never);
  parser.program();

  // Locate the token at/after the caret (c3 wants a token index).
  tokens.fill();
  let caretIndex = tokens.getTokens().length - 1; // EOF fallback
  for (const t of tokens.getTokens()) {
    if (t.channel !== 0) continue;
    const endCol = (t.column ?? 0) + (t.text?.length ?? 0);
    if (t.line > caret.line || (t.line === caret.line && endCol >= caret.column)) {
      caretIndex = t.tokenIndex;
      break;
    }
  }

  const core = new CodeCompletionCore(parser);
  core.preferredRules = new Set(
    RULE_KINDS.map(([name]) => (ExasolParser as unknown as Record<string, number>)[name]).filter(
      (n): n is number => typeof n === "number",
    ),
  );
  core.ignoredTokens = new Set([
    ExasolLexer.LPAREN, ExasolLexer.RPAREN, ExasolLexer.COMMA, ExasolLexer.DOT,
    ExasolLexer.SEMI, ExasolLexer.EQ, ExasolLexer.IDENT, ExasolLexer.QUOTED_IDENT,
    ExasolLexer.STRING, ExasolLexer.NUMBER,
  ]);
  const candidates = core.collectCandidates(caretIndex);

  const kinds: ExasolSuggestions["kinds"] = [];
  for (const [name, kind] of RULE_KINDS) {
    const ruleIndex = (ExasolParser as unknown as Record<string, number>)[name];
    if (typeof ruleIndex === "number" && candidates.rules.has(ruleIndex)) kinds.push(kind);
  }
  const keywords: string[] = [];
  for (const [tokenType] of candidates.tokens) {
    const name = parser.vocabulary.getDisplayName(tokenType) ?? "";
    const clean = name.replace(/^'|'$/g, "");
    if (/^[A-Z][A-Z0-9_]*$/.test(clean)) keywords.push(clean.replace(/_(KW|OP|LANG)$/, ""));
  }
  return { kinds, keywords, errors };
}

/** Parse only — returns the number of syntax errors (corpus gate). */
export function parseErrors(sql: string): number {
  const lexer = new ExasolLexer(CharStream.fromString(sql));
  lexer.removeErrorListeners();
  const parser = new ExasolParser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  let errors = 0;
  parser.addErrorListener({
    syntaxError: () => {
      errors++;
    },
  } as never);
  parser.program();
  return errors;
}
