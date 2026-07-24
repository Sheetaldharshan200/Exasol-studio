# Connection Properties page — task plan

Goal: a DBVisualizer-grade, table-based **Connection / Properties** page per
connection, following the SAME unified design as the info pages
(`ConnectionInfoPanel`-style centered sections, label/value rows), so nothing
feels odd. Everything below ships behind one workspace tab
(`view: "connProps"`, opened from the connection's ⋯ menu → Properties).

Legend: [x] shipped & wired · [~] shipped, stored + partially wired (noted) · [ ] backlog

## 1. Foundation
- [x] Per-connection settings store (Rust `connection_settings.rs`,
      `connection-settings.json` keyed by profile id; raw JSON so the
      frontend owns the shape)
- [x] Tauri commands `connection_settings_get` / `connection_settings_set`
- [x] `ipc.connectionSettingsGet/Set` + `ConnSettings` type with defaults
- [x] New tab view `connProps` + ⋯ menu entry "Properties" per connection
- [x] Unified page skeleton: Connection | Properties sub-tabs, info-page
      design language (max-w-3xl sections, label/value rows, section cards)

## 2. Connection sub-tab (table-based editor, like screenshot 2)
- [x] Connection group: Name, Notes (inline editable rows)
- [x] Database group: Server, Port, Initial schema (+ live Server info row)
- [x] Authentication group: Userid, Password (masked, reveal toggle)
- [x] Options group: Auto Commit, Save Database Password policy,
      Encryption (ssl mode), Compression
- [x] Apply bar (enabled when dirty) → saves profile + settings;
      server-side changes noted as "applies on next connect"

## 3. Properties sub-tab (left nav + search + category pages)
- [x] Left rail: search box filtering categories; groups
      "Connection Properties" (Database Profile, Driver Properties) and
      "Exasol" (the per-database categories below)
- [x] Bottom bar: "Defaults…" (reset current category) + "Apply"
- [x] **Database Profile** — settings format / database type / driver type rows
- [x] **Driver Properties** — Origin | Edited | Parameter | Value | Default
      table over the REAL driver knobs (pool size, ssl mode, compression,
      fetch cap, query timeout, client name); edited rows highlighted;
      pool size + query timeout editable
      [~] applied on next connect (pool is rebuilt then)
- [x] **Authentication** — Require Userid / Require Password prompts,
      password policy (Save Between Sessions / Save During Session /
      Clear at Disconnect)
      [~] policy wired: "Clear at Disconnect" blanks the stored password when
      the connection closes; "Save During Session" never persists it;
      require-flags enforced by the connect overlay when fields are empty
- [x] **Delimited Identifiers** — begin/end identifier, usage checkboxes
      (Scripting / Auto-Completion / Export / Actions) [~] stored; generators
      read it where Studio emits SQL (backlog: sweep all emitters)
- [x] **Qualifiers** — qualify objects / fully qualify / qualify columns
      checkbox matrix [~] stored; same sweep as above
- [x] **Physical Connection** — single shared physical connection (pool
      size 1), validation & keep-alive SQL, keep-alive toggle, idle seconds
      — keep-alive loop runs in Rust against the live pool
- [x] **Transaction** — Auto Commit, ask-when-off (Always / When uncommitted
      updates), transaction isolation (Exasol: SERIALIZABLE only — shown
      honestly), commit batch size (rows)
      [~] autocommit + batch size honored by the data editor / execution path
- [x] **Encoding** — text-to-binary encoding picker (UTF-8 default)
- [x] **SQL Statements** — editable SQL templates with $$variables$$
      (SELECT ALL / … / DROP TABLE) + per-template reset
      [~] stored; object context-menu script generators read them (backlog:
      cover every generator)
- [x] **Connection Hooks** — Run SQL at Connect / at Disconnect, WIRED in
      Rust (best-effort batches, errors logged, never block the connect)
- [x] **Color and Border** — per-connection accent (preset swatches + none),
      show-in checkboxes; wired to the sidebar connection row stripe/name
      [x] tint the workspace tab chips (top-edge stripe, live via
      studio:conn-settings-changed broadcast)
- [x] **SQL Editor** — initial schema selection (connection default / none /
      most recently used), handling loss of connection (no reconnect /
      reconnect / reconnect and re-execute) [~] stored; reconnect behavior
      honored by the run path's connection-error retry
- [x] **Query Builder** — auto-join enabled/type, generate JOIN clause,
      sort columns alphabetically [~] stored for the visual query builder

## 3b. Unified Database Connection page (2026-07-24)
- [x] ONE page hosts Connection | Properties | Database Info | Data Types |
      Search as horizontal tabs (DBVis layout) — the old Connection Info /
      Database Info / Data Types views all render THIS component, so there is
      a single page to maintain
- [x] Header: "Database Connection: <name>", exa://host:port, Actions…
      dropdown (Refresh / Disconnect / Connect), live "Connected · HH:MM:SS"
      uptime ticker
- [x] Results grid: removed the 1px gap between the toolbar and the sticky
      column-header row
- [x] Execution log: clicking a SQL no longer collapses the history dock
- [x] Shared CopyButton (copy → spinner-when-slow → check) swept across
      copy affordances; menu copies emit a "Copied to clipboard" notice

## 3c. Data Types grid + production object search (2026-07-24)
- [x] Data Types = full SYS.EXA_SQL_TYPES grid (every server column, booleans
      as checkboxes, numbers right-aligned)
- [x] Column headers: click to sort asc/desc (numeric-aware, with indicator),
      DRAG to rearrange — order persists (localStorage)
- [x] Find bar with next/previous occurrence (Enter / Shift+Enter, chevrons,
      x/y counter, match + current-match highlighting, scroll-into-view)
- [x] Object Search (connection Search tab + sidebar): type filter chips with
      counts (All/Schemas/Tables/Views/Columns/Scripts/Functions), grouped
      results with sticky type headers, matched-substring highlighting,
      next/previous occurrence buttons (F3 / Shift+F3), selection counter —
      on top of the existing ranked, bounded, debounced server-side search

## 3d. One tab per connection + dead-code removal (2026-07-24)
- [x] ⋯ menu entries (Connection info / Properties / Database info / Data
      types) all open the SAME single "Connection" tab, switching its section
      — no sibling tabs per view anymore
- [x] Removed dead views (connInfo/dbInfo/dataTypes TabView members + icons),
      deleted ConnectionInfoPanel.tsx, removed ipc.listDataTypes + DataType
      type + mock case + Rust list_data_types command

## 4. Follow-ups (backlog)
- [ ] Sweep every SQL emitter (context menus, exports, edit-data grid) through
      the delimited-identifier + qualifier settings
- [ ] "Global Properties" page (defaults inherited by every connection)
- [ ] Per-category reset history / diff view

## 5. Knowledge upkeep (this change)
- [x] memory note (connection-properties design)
- [x] llm-wiki page update (editing-model / connection-properties)
- [x] obsidian vault design-log entry
- [x] `graphify update .` + commit graph.json
