# Design — Notebook artifact hub

## Context

Two surfaces implement the same idea with different vocabularies: `NotebookTab.tsx` (cells, `chart?: string`, Recharts via `ShadcnChartPanel`, localStorage) and `Dashboards.tsx` (panels, `viz`, echarts via `buildChartOption`, `/v1/dashboards`). The import seam already exists (`importDashboard()` in NotebookTab converts panels → cells). The assistant cannot be prompted from outside its own tree — `ExaComposerContext` is mounted inside `ExaThread`, and the older `AssistantPanel.pendingPrompt` path is orphaned (written, never rendered).

## Goals / Non-Goals

Goals: one artifact surface (the Notebook); full chart-kind coverage behind a visual tile picker; per-cell connection; an `exa:prompt` event any feature can dispatch; System dashboards reachable from the notebook's bottom bar; ExasolStudio.tsx gets smaller, not bigger.

Non-goals: dashboard grid layout in the notebook; changing `/v1/dashboards`; porting the Perspective "explore" panel; new notebook persistence.

## Decisions

1. **Extract before delete.** Three pure/presentational modules leave `Dashboards.tsx` first, then the file and `DashboardTab` are deleted:
   - `features/bi/chart-option.ts` — `buildChartOption`, palette, `AXISLESS`; pure, gets `chart-option.test.ts` (kind coverage, empty result, single-column result, custom `option.series` override).
   - `features/bi/viz-tiles.tsx` — the 17 SVG tiles keyed by kind plus one canonical `CHART_KINDS` list; the picker consumes these.
   - `features/bi/system-dashboards.ts` — the three System dashboard factories (already pure).
   `report-export.ts` dies with `Dashboards.tsx` if nothing else imports it (unreachable code is a defect).

2. **Two renderers, one seam.** `ShadcnChartPanel` keeps its 8 kinds (bar, hbar, line, area, pie, donut, radar, radial — the notebook's existing look). A new `EchartsCell` (lazy `import("echarts")`, reusing `buildChartOption`) renders the echarts-only kinds: scatter, heatmap, funnel, treemap, gauge. A single `CellChart` component picks the renderer from the kind. KPI is a small tile component (first row, first numeric column, label from column name) — no chart library.

3. **Cell model grows two optional fields** (backward-compatible with stored notebooks): `chart?: string` (existing) and `connection?: { profileId: string; name: string }`. Execution resolves `cell.connection?.profileId ?? activeProfileId`; if the stored profile is not among open connections, the cell errors with "…no longer connected" rather than falling back silently. Connected profiles come from the shell: `NotebookTab` gains a `connections: { profileId: string; name: string }[]` prop (the shell already owns this list).

4. **`exa:prompt` CustomEvent** — handled inside `ExaThread` exactly like `exa:reload-message` (guarded expand → `composer.setText` → `composer.send`). Detail: `{ text: string }`. A tiny helper `features/assistant/exa/ask-exa.ts` exports `askExa(text)`: dispatches `studio:assistant-open` (existing shell mechanism for showing the dock — verify name during implementation) then `exa:prompt`. The notebook's dead `onAsk` prop and the editor's `setAiPrompt` writes are rewired to `askExa`, fixing the orphaned-prompt bug for both.

5. **System button** — a bottom bar on the notebook with a "System" dropdown (three entries, using the same tile/icon art). Choosing one builds cells from the factory output (same conversion as `importDashboard`) into a notebook titled `System · <name>`, replaces its cells if it already exists (regenerate-on-open — the code is the source of truth), and runs all cells. Stored System dashboards on the server are untouched.

6. **Shell cleanup** — remove: `"bi"`/`"dashboard"` from `TabView` + icons, `dashboardId` from `SqlTab`, `openDashboardTab`/`openSavedDashboard`/`openBiTab`/`openBi`, the `bi` ActivityRail entry, both render blocks, `workspace-persist` allowlist entries (old persisted tabs drop silently — existing behavior for unknown views), and the `ui_open` remap `dashboards → bi` becomes `dashboards → notebook`.

## Risks / Trade-offs

- "radial" stays notebook-only (Recharts) — acceptable: the schema enum is unchanged and import maps unknown kinds to `bar` (existing behavior).
- Regenerate-on-open System notebooks discard user edits to those notebooks — deliberate: they are views of code-defined dashboards, and edits belong in a copy (rename does that naturally).
- Deleting `Dashboards.tsx` removes the explore/Perspective panel — accepted non-goal; the WASM dependency may become removable later.
