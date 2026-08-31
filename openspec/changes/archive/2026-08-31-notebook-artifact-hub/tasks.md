# Tasks — Notebook artifact hub

## 1. Extract pure modules from Dashboards.tsx

- [x] 1.1 `features/bi/chart-option.ts`: move `buildChartOption`, palette, `AXISLESS`. Tests in `features/bi/chart-option.test.ts`: every canonical kind returns an option; empty rows; one-column rows; `viz.option.series` full override wins.
- [x] 1.2 `features/bi/viz-tiles.tsx`: move the SVG tile art keyed by kind; export `CHART_KINDS` (canonical list incl. `radial` + `kpi` + `table`).
- [x] 1.3 `features/bi/system-dashboards.ts`: move `queryPerfDashboard`, `sessionsDashboard`, `dbSizeDashboard`, `SYSTEM_DASHBOARDS`.

## 2. exa prompt seam

- [x] 2.1 `ExaThread.tsx`: handle `exa:prompt` (`{ text }`) — expand → setText → send, mirroring `exa:reload-message`.
- [x] 2.2 `features/assistant/exa/ask-exa.ts`: `askExa(text)` opens the assistant dock and dispatches `exa:prompt`. Rewire the notebook `onAsk` and the editor AI actions (`aiAskSql`) from the dead `setAiPrompt` state to `askExa`; delete the orphaned `AssistantPanel` pendingPrompt wiring in the shell.

## 3. Notebook hub (NotebookTab.tsx)

- [x] 3.1 Cell model: add `connection?: { profileId, name }`; persist/load with notebooks; execution resolves cell connection with explicit "no longer connected" error. Pure resolver in `features/workbench/notebook-cell.ts` with tests (`notebook-cell.test.ts`): default fallback, valid override, missing override, kpi/table kind mapping.
- [x] 3.2 Visual chart picker: dropdown of `viz-tiles` art (image + name) covering all kinds + KPI + table; replaces the text button palette.
- [x] 3.3 Rendering: `CellChart` picks `ShadcnChartPanel` (8 kinds) vs new `EchartsCell` (scatter, heatmap, funnel, treemap, gauge via `buildChartOption`); KPI tile component; table = existing grid. Remove the dead `ResultChart` echarts path if superseded.
- [x] 3.4 Per-cell connection dropdown fed by a new `connections` prop from the shell.
- [x] 3.5 "Ask exa" per cell + toolbar: prompt carries SQL, chart kind, and the user's intent to create/modify the design.
- [x] 3.6 Bottom bar with "System" dropdown → open each System dashboard as auto-running notebook (`System · <name>`, regenerated on open).

## 4. Remove the Dashboards surface

- [x] 4.1 Delete `Dashboards.tsx` render paths from the shell: tabs (`bi`, `dashboard`), ActivityRail entry, open/persist wiring, `ui_open` remap → `notebook`.
- [x] 4.2 Delete `features/bi/Dashboards.tsx`; delete `report-export.ts` + test if now unreferenced.
- [x] 4.3 `workspace-persist.ts`: drop `dashboard` view + `dashboardId`; confirm old workspaces load clean.

## 5. Verify & ship

- [x] 5.1 `tsc --noEmit`, `vite build`, full `node --test` suite green; new tests included.
- [x] 5.2 Playwright pass against exa web: picker renders tiles, chart kinds render, System button opens notebooks, Ask exa sends.
- [x] 5.3 Docs: fold `docs/site/dashboards.mdx` into `workbench/notebook.mdx`; update sidebar/index references.
- [x] 5.4 Codex review; fix findings; PR through CI; squash-merge.
