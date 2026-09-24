---
title: Editor intelligence — dynamic UDF hints, context linting, AI ghost text (and the 8 MB chunk that blocked the build)
category: workbench
type: gotcha+design
updated: 2026-09-24
---

# The 8 MB chunk that killed the production build

**Symptom.** `vite build` failed at `generateBundle`:

```
[vite:build-import-analysis] assets/index-XXXX.js (1:0): Parse error @:1:1
```

tsc was clean, every test passed, and the reported position (1:1) pointed at
valid minified code. Bisecting blamed whichever file was added last, which was
a red herring — the file only mattered because it pushed the bundle over a
threshold.

**Cause.** `vite:build-import-analysis` runs each emitted chunk through
**es-module-lexer**, a WASM lexer, to find dynamic imports for module preload.
Our single entry chunk had grown to **8,547,734 bytes**. Past roughly 8 MiB the
lexer's `C.memory.grow()` fails, `C.parse()` returns false, and the error is
reported at offset 0 — hence "@:1:1" with no useful position.

It is NOT rollup's parser: `parseAst` and `parseAstAsync` both parse the same
chunk successfully in isolation. Only vite's lexer path fails.

**Diagnosis recipe.** Dump the chunks from a temporary config with an
`enforce: "pre"` plugin whose `generateBundle` writes `bundle[f].code` to disk
(renderChunk/minify has already run by then), then check sizes. Anything near
8 MiB is the culprit.

**Fix.** `apps/desktop/vite.config.ts` now splits heavy vendors with
`build.rollupOptions.output.manualChunks`: monaco, echarts (+zrender),
recharts (+d3-*), mermaid, flow (@xyflow/@dagrejs). The entry chunk dropped
from 8.5 MB to ~4.1 MB, and the app shell can paint before Monaco arrives.

**Keep this in mind:** the limit is a hard ceiling, not a warning. Any future
dependency that lands in the entry chunk can cross it again and the failure
will look like a syntax error in an unrelated file.

# Three editor features, and what review found in them

## Dynamic UDF body hint

`lib/udf-placeholder.ts` + `components/studio/udf-hints.ts`. An empty
`--/ … /` body gets injected ghost text — "your Python code goes here" —
naming whatever language the CREATE header carries. Nothing enumerates
languages: `languageLabel()` derives the name from the word (trailing version
digits dropped, so `PYTHON3` → `Python` and a future `JULIA` → `Julia`), and
`headerLanguage()` takes the words between CREATE and SCRIPT and drops the
grammar ones, so `CREATE SCRIPT` with no language correctly means Lua.

It is a **decoration**, not buffer text: it cannot be selected, copied or sent
to the database, and the generic `--/` snippet now inserts an EMPTY body
(`${0}`) so the hint can do the naming that a fixed placeholder could not.

The snippet's language choice list also comes from the server now —
`languageChoice()` builds `${1|…|}` from SCRIPT_LANGUAGES, dropping aliases
containing `,` `|` `$` `}` because those would corrupt the snippet syntax.

## Context-aware linting

Two deliberately separate modules:

- `lib/sql-diagnostics.ts` — what is wrong in ANY database (unclosed string,
  comment, bracket, script block). Severity Error.
- `lib/sql-lint.ts` — what is wrong in THIS connection: a schema or table the
  catalog does not have, a script language SCRIPT_LANGUAGES does not offer,
  and Exasol dialect shapes (`FETCH FIRST`, `SELECT TOP`, `ISNULL`,
  `GETDATE()`, `NOW()`).

`maskNonCode()` blanks strings, comments and UDF bodies **with spaces of equal
length**, so offsets survive and every regex below it runs on code only.

Rules that keep it from crying wolf: names are only checked when the catalog
is actually loaded, only QUALIFIED names are checked (an unqualified one may
be a CTE, a derived table, or resolved through the open schema), and quoted
identifiers are skipped entirely.

## AI inline completion

`lib/inline-completion.ts` (pure), `lib/schema-context.ts` (bounded prompt
grounding), `components/studio/inline-ai.ts` (Monaco provider),
`POST /v1/complete` in `packages/agent-core/src/server.ts`, and
`agent.complete()` in `lib/agent-client.ts`.

The editor decides WHEN to ask (350 ms idle, never mid-string, never with text
after the cursor on the same line) and cuts the answer down before showing it.
`schemaContextLines()` stops on a **whole table** boundary — half a table's
columns is worse context than none, because a model shown `ORDERS.ID` but not
`ORDERS.TOTAL` invents the second.

The route returns `{text: ""}` rather than an error when no model is
configured: an error banner on every keystroke is worse than silence.

# Codex review findings (all fixed before shipping)

| # | Where | Defect |
|---|---|---|
| 1 | `sql-lint.ts` masker | An **indented** `--/` was treated as an ordinary comment, so the UDF body was linted as SQL. `findScriptBlocks` in `lib/sql-text.ts` trims the line first — the two must agree. Same bug fixed in `sql-diagnostics.ts`, for both the opener and the closing `/`. |
| 2 | `sql-lint.ts` dialect pass | `SELECT S.NOW()` — a user script named NOW — was flagged as the builtin Exasol lacks. A preceding `.` now skips the match. |
| 3 | `sql-lint.ts` language pass | The language word was located with `indexOf` from the block start, so a language name mentioned in a comment ABOVE the CREATE took the underline. Now searched after CREATE. |
| 4 | `sql-lint.ts` masker | The `--/` branch jumped `i` past the whole block, so the HEADER never got masked and `CREATE /* note */ PYTHON3` read "NOTE" as the language. Now it steps past `--/` only and lets the header be scanned normally. |
| 5 | `udf-placeholder.ts` | Same comment bug in `headerLanguage` — "your Note code goes here". Comments are stripped first. |
| 6 | `udf-placeholder.ts` | `AS` on the line directly above the closing `/` gave `bodyLine = ` the `/` line, drawing the hint on the block terminator. |
| 7 | `inline-completion.ts` | The "stop before repeating the suffix" cut used `indexOf`, which matched **inside a string literal**: `WHERE note = 'ORDER BY id'` was truncated to `WHERE note = '`. Now matched a whole line at a time. |
| 8 | `inline-completion.ts` | `hit > 0` kept a suggestion that was *entirely* the text already below the cursor. `hit >= 0` drops it. |
| 9 | `inline-ai.ts` | The cache key used only the prefix, so a suggestion cached for `SELECT |` was replayed for `SELECT |\nFROM T` and duplicated `FROM T`. The key now carries a suffix window. |
| 10 | `sql-markers.ts` | Markers are owned by a MODEL. Switching tabs set markers on the new model without clearing the old one, so a stale underline survived on the tab you left. |
| 11 | `udf-hints.ts` | Same class: decoration ids from model A were passed to `editor.deltaDecorations` while model B was attached. Now tracked per model and cleared on switch, via `model.deltaDecorations`. |

The pattern worth remembering from 10 and 11: **markers and decorations belong
to the model, not the editor.** In a tabbed workbench where every tab owns a
model, anything installed on the editor must remember which model it wrote to
and clear that one.
