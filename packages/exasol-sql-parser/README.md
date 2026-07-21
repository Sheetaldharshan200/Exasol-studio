# exasol-sql-parser

Standalone Exasol SQL grammar (ANTLR / antlr4ng) with caret code-completion
(antlr4-c3). Built inside Exasol Studio, designed for extraction as a team repo.

- `TASKS.md` — the phased plan (grammar → completion → quality gates → extraction)
- `npm run generate` — ANTLR codegen (requires Java ≥ 11)
- `src/grammar/` — `ExasolLexer.g4` + `ExasolParser.g4` (entity rules are the
  completion contract: schemaName / tableName / columnName / functionName)
- `src/completion.ts` — `getSuggestions(sql, caret)`; Studio's editor maps the
  returned kinds onto its live catalog (tables, columns, UDFs from SYS)
