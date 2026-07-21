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
- [ ] Literals: string (with '' escape), numeric (incl. exponent), DATE/TIMESTAMP/INTERVAL literals, boolean
- [ ] Identifiers: regular vs "quoted" (case rules), unicode identifiers
- [ ] Comments (`--`, `/* */`), statement terminator, `/` script terminator
- Acceptance: lexes every statement in `tests/corpus/*.sql` with zero errors

## Phase 2 — Query grammar (the 80% path)
- [ ] `SELECT`: select list, FROM (tables, subqueries, VALUES), all JOIN forms, WHERE, GROUP BY (+ CUBE/ROLLUP/GROUPING SETS), HAVING, QUALIFY, ORDER BY (NULLS FIRST/LAST), LIMIT/OFFSET, WITH (CTEs), UNION/INTERSECT/MINUS/EXCEPT
- [ ] Expressions: full operator precedence, CASE, CAST, window functions (OVER, frames), aggregate DISTINCT, subquery predicates (IN/EXISTS/ANY/ALL), `CONNECT BY` hierarchical queries
- Acceptance: parses the full TPC-H + TPC-DS query sets adapted to Exasol dialect

## Phase 3 — DML + DDL
- [ ] INSERT / UPDATE / DELETE / MERGE / TRUNCATE
- [ ] CREATE/ALTER/DROP: SCHEMA, TABLE (constraints, DISTRIBUTE BY, PARTITION BY, identity), VIEW, FUNCTION, CONNECTION, USER, ROLE, CONSUMER GROUP
- [ ] COMMENT ON, RENAME, GRANT/REVOKE matrix

## Phase 4 — Exasol-specific surface
- [ ] `IMPORT INTO … FROM CSV|FBV|JDBC|EXA|LOCAL AT …` / `EXPORT … INTO …` (full option clauses: FILE, SECURE, ROW SEPARATOR, COLUMN options, reject clauses)
- [ ] UDF scripts: `CREATE (PYTHON3|LUA|JAVA|R) (SCALAR|SET) SCRIPT … (EMITS|RETURNS) … AS <body> /` — body captured as opaque island (lexer mode)
- [ ] Adapter scripts + `CREATE VIRTUAL SCHEMA … USING … WITH …`
- [ ] Lua scripts (`CREATE SCRIPT … AS`), EXECUTE SCRIPT
- [ ] Session/system: ALTER SESSION/SYSTEM, KILL, FLUSH STATISTICS, RECOMPRESS, REORGANIZE, PRELOAD

## Phase 5 — Completion engine
- [ ] antlr4-c3 candidate collection at caret token
- [ ] preferredRules → entity kinds: schema / table / view / column / function / script / connection / consumer group
- [ ] Context resolution: alias map from parse tree (FROM/JOIN visitors), CTE names as virtual tables, subquery scoping
- [ ] Keyword candidates filtered by follow-set (only grammatically valid)
- [ ] API: `getSuggestions(sql, caret) → { kinds, keywords, tableRefs }` — drop-in for Studio's `sql-completion.ts`
- Acceptance: golden tests — 50 caret scenarios with exact expected suggestion sets

## Phase 6 — Error tolerance & performance
- [ ] Error-recovery strategy so half-typed statements still yield candidates
- [ ] Incremental / statement-splitting so only the caret statement is parsed
- [ ] Benchmarks: <5ms p95 completion on a 500-line script (M-series baseline)

## Phase 7 — Quality gates
- [ ] Corpus: every example from Exasol docs SQL reference into `tests/corpus/`
- [ ] Fuzzing pass (grammarinator or simple mutator) — no hangs/crashes
- [ ] CI: codegen + typecheck + tests on push (Java setup step)

## Phase 8 — Extraction as team repo
- [ ] Move to own repo (`exasol-labs/exasol-sql-parser` proposal), MIT license, README with API docs
- [ ] npm publish pipeline; Studio consumes the published package
- [ ] Studio integration flag: prefer Exasol engine, dt-sql-parser fallback removed
