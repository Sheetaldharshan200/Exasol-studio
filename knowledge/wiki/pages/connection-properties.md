---
title: Connection Properties page
category: feature
status: shipped
---

# Connection Properties page

Every connection has a **Properties** workspace tab (⋯ menu on the sidebar
connection → Properties; `view: "connProps"`). It is Studio's DBVisualizer
equivalent, restyled in the unified info-page design (centered sections,
label/value rows — same language as `ConnectionInfoPanel`) so it does not
feel like a foreign dialog.

## Structure

- **Connection sub-tab** — table-based profile editor: Name/Notes, Server/
  Port/Initial schema (+ live Server Info), Userid/Password (blank keeps the
  stored password — server rule in `profiles::save_profile`), Options.
- **Properties sub-tab** — left category rail with search; categories:
  Database Profile, Driver Properties, Authentication, Delimited Identifiers,
  Qualifiers, Physical Connection, Transaction, Encoding, SQL Statements,
  Connection Hooks, Color and Border, SQL Editor, Query Builder.
  Bottom bar: **Defaults…** (resets the current category) + **Apply**.

## Where things live

- UI: `apps/desktop/src/features/connection/ConnectionPropertiesTab.tsx`
  (exports `ConnSettings`, `DEFAULT_CONN_SETTINGS`, `loadConnSettings`).
- Storage: Rust `connection_settings.rs` → `connection-settings.json`
  (raw JSON keyed by profile id; the frontend owns the shape, so adding a
  category never needs a Rust change).

## What the backend actually wires (be honest here)

`connection.rs::connect/disconnect` read the settings and honor:

- **Connection Hooks** — Run SQL at Connect / at Disconnect (best-effort,
  ;-split, failures logged, never block).
- **Keep-alive** — a spawned loop holding only a pool CLONE; `pool.close()`
  on disconnect ends it (`is_closed()` sentinel). Min interval 10 s.
- **Pool size / single shared physical connection** — `open_pool_sized`,
  applied on the next connect.
- **Password policy** — "Clear at Disconnect" blanks the stored password
  (`profiles::clear_profile_password`); "Save During Session" never persists
  a typed password.

Everything else (delimited identifiers, qualifiers, SQL templates, editor
behavior, query-builder options) is stored and read by the frontend where
Studio generates SQL; the full wiring sweep is tracked in repo-root
`tasks.md`. The accent color (Color and Border) paints the sidebar
connection row when "Show in Database Connection name" is on.

## Gotchas

- `list_connection_profiles` NEVER returns passwords — the editor treats a
  blank password as "unchanged".
- Exasol is always SERIALIZABLE; the Transaction page shows the isolation
  picker but says so instead of pretending it can be lowered.
