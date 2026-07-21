# Exasol SQL Parser & Completion Engine — Task Plan

Goal: a standalone, world-class **Exasol** grammar engine (ANTLR) with
code-completion at caret — extractable as its own repo for the team.
Stack: `antlr4ng` (TS runtime) + `antlr4-c3` (completion core) — the same
architecture as dt-sql-parser's dialects, but with a true Exasol grammar.

## Phase 0 — Scaffold ✅
- [x] Workspace package `@exasol-studio/exasol-sql-parser` (self-contained; no Studio imports so it can be extracted 1:1)
- [x] Deps: antlr4ng, antlr4-c3; codegen via antlr4ng-cli (needs Java ≥11 locally/CI)
- [x] Starter `ExasolLexer.g4` + `ExasolParser.g4` (SELECT-family skeleton)
- [x] Completion engine skeleton (`src/completion.ts`) on antlr4-c3
- [x] Test harness layout (`tests/`)
- [x] Codegen verified (Java 26 via Homebrew; two-step antlr4ng + postgen normalization)
- [x] Phase 5 v0 WORKING: antlr4-c3 caret suggestions over the real grammar - 5 golden tests green (corpus parse, FROM->table/schema, select-list/WHERE->column, GROUP->BY)

## Phase 1 — Lexer completeness
- [ ] Full keyword inventory from Exasol docs "Reserved words" + SYS.EXA_SQL_KEYWORDS (reserved vs non-reserved split — non-reserved must stay usable as identifiers)
- [x] Literals: string (with '' escape), numeric (incl. exponent), DATE/TIMESTAMP/INTERVAL literals, boolean
- [ ] Identifiers: regular vs "quoted" (case rules), unicode identifiers
- [ ] Comments (`--`, `/* */`), statement terminator, `/` script terminator
- Acceptance: lexes every statement in `tests/corpus/*.sql` with zero errors

## Phase 2 — Query grammar (the 80% path)
- [x] `SELECT`: select list, FROM (tables, subqueries, VALUES), all JOIN forms, WHERE, GROUP BY (+ CUBE/ROLLUP/GROUPING SETS), HAVING, QUALIFY, ORDER BY (NULLS FIRST/LAST), LIMIT/OFFSET, WITH (CTEs), UNION/INTERSECT/MINUS/EXCEPT
- [x] Expressions: precedence chain, CASE, CAST, EXTRACT/POSITION, window functions (OVER + ROWS/RANGE frames), aggregate DISTINCT, subquery predicates (IN/EXISTS/ANY/SOME/ALL), `CONNECT BY [NOCYCLE]`/`START WITH`/`PRIOR`
- Acceptance (partial): TPC-H Q1/Q3 + Exasol-features corpus parse cleanly; full TPC-H/TPC-DS sweep still open

## Phase 3 — DML + DDL
- [x] INSERT (multi-row, DEFAULT) / UPDATE (+FROM) / DELETE / MERGE (matched update/delete, not-matched insert) / TRUNCATE
- [~] CREATE SCHEMA / CREATE TABLE (columns+types incl. INTERVAL/HASHTYPE/GEOMETRY, constraints, DISTRIBUTE BY, AS SELECT) / DROP — ALTER, VIEW/FUNCTION/CONNECTION/USER/ROLE/CONSUMER GROUP still open
- [ ] COMMENT ON, RENAME, GRANT/REVOKE matrix

## Phase 4 — Exasol-specific surface
- [x] `IMPORT INTO … FROM CSV|FBV|JDBC|EXA|LOCAL [SECURE] AT …` / `EXPORT … INTO …` (FILE clauses, connection refs with USER/IDENTIFIED BY, ENCODING/SKIP/ROW/COLUMN options, REJECT LIMIT)
- [x] UDF scripts: `CREATE (PYTHON3|LUA|JAVA|R) (SCALAR|SET) SCRIPT … (EMITS|RETURNS) … AS <body> /` — body captured as opaque island (SCRIPT-armed lexer mode; bodies with SQL-looking content verified)
- [x] Adapter scripts + `CREATE VIRTUAL SCHEMA … USING … WITH key='v' …`
- [x] Lua scripts (`CREATE SCRIPT … AS`), EXECUTE SCRIPT with arguments
- [ ] Session/system: ALTER SESSION/SYSTEM, KILL, FLUSH STATISTICS, RECOMPRESS, REORGANIZE, PRELOAD

## Phase 5 — Completion engine
- [x] antlr4-c3 candidate collection at caret token
- [ ] preferredRules → entity kinds: schema / table / view / column / function / script / connection / consumer group
- [x] Context resolution: alias-resolved tableRefs from the parse tree, CTE names as virtual tables, caret-statement scoping (subquery-level scoping still open)
- [x] Keyword candidates filtered by follow-set (only grammatically valid)
- [x] API: `getSuggestions(sql, caret) → { kinds, keywords, tableRefs, ctes, errors }` — drop-in for Studio's `sql-completion.ts`
- Acceptance (partial): 17 golden tests incl. scope/error-tolerance; grow toward 50 scenarios

## Phase 6 — Error tolerance & performance
- [x] Error-recovery verified: half-typed WHERE/alias-dot statements still yield kinds + tableRefs
- [ ] Incremental / statement-splitting so only the caret statement is parsed
- [~] Benchmark: 120-statement script completes in ~20ms cold-path (golden-tested <100ms); <5ms p95 target + statement-splitting still open

## Phase 7 — Quality gates
- [ ] Corpus: every example from Exasol docs SQL reference into `tests/corpus/`
- [ ] Fuzzing pass (grammarinator or simple mutator) — no hangs/crashes
- [ ] CI: codegen + typecheck + tests on push (Java setup step)

## Phase 8 — Extraction as team repo
- [ ] Move to own repo (`exasol-labs/exasol-sql-parser` proposal), MIT license, README with API docs
- [ ] npm publish pipeline; Studio consumes the published package
- [~] Studio integration DONE (editor uses the Exasol engine as layer 0, alias-resolved refs feed the live catalog; dt-sql-parser + heuristics remain as fallbacks). Removing the fallback awaits Phase 7 gates
