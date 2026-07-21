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

export type TableRef = { schema?: string; table: string; alias?: string };

export type ExasolSuggestions = {
  /** Entity kinds valid at the caret. */
  kinds: ("schema" | "table" | "column" | "function")[];
  /** Grammar-valid keywords at the caret (uppercase). */
  keywords: string[];
  /** Tables referenced by the statement containing the caret (alias-resolved). */
  tableRefs: TableRef[];
  /** CTE names visible in that statement (virtual tables). */
  ctes: string[];
  /** Syntax errors seen while parsing (empty = clean parse). */
  errors: number;
};

type Ctx = { ruleIndex?: number; getChildCount(): number; getChild(i: number): unknown; getText(): string; start?: { tokenIndex: number } | null; stop?: { tokenIndex: number } | null };

function walk(ctx: Ctx, fn: (c: Ctx) => void): void {
  fn(ctx);
  for (let i = 0; i < ctx.getChildCount(); i++) {
    const ch = ctx.getChild(i) as Ctx | null;
    if (ch && typeof ch.getChildCount === "function" && typeof (ch as Ctx).ruleIndex === "number") walk(ch, fn);
  }
}

/** Strip quoting; uppercase unquoted identifiers (Exasol case rules). */
function cleanIdent(text: string): string {
  return text.startsWith('"') ? text.slice(1, -1).replace(/""/g, '"') : text.toUpperCase();
}

const R = ExasolParser as unknown as Record<string, number>;

function collectScope(tree: Ctx, caretIndex: number): { tableRefs: TableRef[]; ctes: string[] } {
  // Narrow to the statement containing the caret (multi-statement scripts).
  let stmt: Ctx = tree;
  // Statements appear in source order; the last one starting at/before the
  // caret is the enclosing (or nearest-preceding) statement. Range-end checks
  // are unreliable here: hidden tokens make indices sparse and half-typed
  // statements have error-recovered stop tokens.
  walk(tree, (c) => {
    if (c.ruleIndex === R.RULE_statement && caretIndex >= (c.start?.tokenIndex ?? 0)) stmt = c;
  });
  const tableRefs: TableRef[] = [];
  const ctes: string[] = [];
  walk(stmt, (c) => {
    if (c.ruleIndex === R.RULE_cteItem) {
      const first = c.getChild(0) as Ctx | null;
      if (first?.getText) ctes.push(cleanIdent(first.getText()));
    }
    if (c.ruleIndex === R.RULE_tablePrimary || c.ruleIndex === R.RULE_schemaQualifiedTable) {
      if (c.ruleIndex === R.RULE_schemaQualifiedTable) return; // handled via parent below
    }
    if (c.ruleIndex === R.RULE_tablePrimary) {
      let schema: string | undefined;
      let table: string | undefined;
      let alias: string | undefined;
      for (let i = 0; i < c.getChildCount(); i++) {
        const ch = c.getChild(i) as Ctx | null;
        if (!ch || typeof (ch as Ctx).ruleIndex !== "number") continue;
        if (ch.ruleIndex === R.RULE_schemaQualifiedTable) {
          const names: string[] = [];
          walk(ch, (n) => {
            if (n.ruleIndex === R.RULE_schemaName || n.ruleIndex === R.RULE_tableName) names.push(cleanIdent(n.getText()));
          });
          if (names.length === 2) [schema, table] = names;
          else table = names[0];
        } else if (ch.ruleIndex === R.RULE_alias) {
          alias = cleanIdent(ch.getText());
        }
      }
      if (table) tableRefs.push({ schema, table, alias });
    }
  });
  return { tableRefs, ctes };
}

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
    reportAmbiguity: () => {},
    reportAttemptingFullContext: () => {},
    reportContextSensitivity: () => {},
  } as never);
  const tree = parser.program() as unknown as Ctx;

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
  const { tableRefs, ctes } = collectScope(tree, caretIndex);
  return { kinds, keywords, tableRefs, ctes, errors };
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
    reportAmbiguity: () => {},
    reportAttemptingFullContext: () => {},
    reportContextSensitivity: () => {},
  } as never);
  parser.program();
  return errors;
}
