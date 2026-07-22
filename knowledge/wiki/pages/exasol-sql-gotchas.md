# Exasol SQL gotchas (generated SQL must respect these)

Studio generates SQL in many places (dashboard panels, pagination, editors). Exasol's
dialect differs from Postgres/MySQL — bake these rules into any SQL builder.

- **`OFFSET` requires `ORDER BY`.** `... LIMIT n OFFSET m` throws
  *"OFFSET not allowed in LIMIT without ORDER BY"* — even `OFFSET 0`. Only emit `OFFSET`
  together with an `ORDER BY` (e.g. `ORDER BY 1` on a wrapper subquery); for the first
  page use a bare `LIMIT n` with no OFFSET. (Fixed in `Dashboards.tsx` panel paging.)
- **`LIMIT n`, not `TOP`/`FETCH FIRST`.**
- **Passwords are double-quoted identifiers:** `CREATE/ALTER USER x IDENTIFIED BY "pw"`.
- **`ALTER TABLE ... MODIFY COLUMN`** (Exasol uses MODIFY, not ALTER COLUMN TYPE).
- **`RENAME TABLE/VIEW/SCHEMA/USER/SCRIPT/FUNCTION old TO new`** — the target is unqualified
  (stays in the same schema).
- **Constraints are named:** `ALTER TABLE t ADD CONSTRAINT name PRIMARY KEY (...)` /
  `DROP CONSTRAINT name`.
- Identifiers are **uppercase-normalized unless double-quoted**; quote the exact stored
  case (result metadata can report a different case — caused `object "city_id" not found`).
- **Statement errors come back inside the result** (`r.results.find(x => x.error)`), not as
  a thrown exception — always inspect the result.

Rule: when adding a SQL builder, prefer generating into a **query tab** (reviewable) over
running blind, and never assume Postgres syntax.
