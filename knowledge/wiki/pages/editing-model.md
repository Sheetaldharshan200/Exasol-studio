# Editing model — data & structure

Exasol Studio edits happen **in place** inside the Details/result surface, with two
consistent exits and no confirmation dialogs. This is the pattern to follow for any new
editor.

## The two-button convention

Every stage-then-commit editor exposes the same pair on the right of its toolbar:

- **Review SQL** — builds the statements and opens them in a **new query tab**
  (`onOpenSql(sql, title)` → `openSqlTab` in `ExasolStudio.tsx`). Inspect/tweak/run there.
- **Confirm & Save** (primary) — runs the statements **directly, no dialog**
  (`onApply(statements)`). On the first DB error it stops, keeps the user's edits, and
  shows a red inline banner with the message + the failing statement. On success it clears
  the draft and refreshes.

Both take `{ ok, error?, failedSql? }`. Exasol returns statement errors **inside the result**
(`r.results.find(x => x.error)`), not as a thrown exception — always inspect the result.

## Data editing — `EditableResultGrid.tsx`

Stages cell edits / inserts / deletes → PK-based (or all-column, if no PK) UPDATE/DELETE/INSERT.
Commits via `commitEdits`. Uses `catalogColumns` to quote the **exact stored identifier case**
(result metadata can report a different case, which caused `object "city_id" not found`).

## Structure editing — `TableStructureEditor.tsx`

Lives under **Details → Columns → "Edit structure"** (tables only). Edits a local draft
(rename inline, type dropdown with a Custom… fallback, NOT NULL checkbox, key-pin per column,
add/drop rows), then **diffs the draft against the original** to emit ordered ALTER TABLE
statements. Commits via `commitDdl` (runs against the object tab's own connection, then bumps
the tree + catalog and re-reads the shape).

Statement order matters — emitted as: ADD → MODIFY (keyed on original name) → RENAME →
DROP → PK drop/add (PK uses final names, constraint `PK_<table>`). Exasol DDL notes:
`MODIFY COLUMN "c" <type> [NOT NULL]` restates the column; `RENAME COLUMN old TO new`;
PK is a named constraint (`ADD CONSTRAINT ... PRIMARY KEY` / `DROP CONSTRAINT`).
