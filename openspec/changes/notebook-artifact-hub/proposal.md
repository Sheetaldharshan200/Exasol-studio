# Notebook as the artifact hub

## Why

Studio has two overlapping analysis surfaces: the Notebook (SQL/markdown/mermaid cells, 8 Recharts chart kinds, localStorage) and Dashboards (a 2,100-line grid feature with 12 echarts kinds, /v1/dashboards persistence, System dashboards). They duplicate chart pickers, renderers, and execution paths, disagree on which chart kinds exist ("radial" is renderable but not in the schema), and split the user's mental model. The user wants one surface: the Notebook is where every artifact — query, text, diagram, chart, KPI — is created, with dashboards folded in, per-cell database choice, a visual chart-type picker, and a direct line to the exa assistant to create and modify designs. System dashboards stay reachable from a button at the bottom of the notebook.

## What Changes

- The Dashboards activity, list tab (`bi`), and per-dashboard tab (`dashboard`) are removed from the rail, tab model, and shell. `Dashboards.tsx` (2,100 lines) and `DashboardTab` are deleted; the pure pieces survive as extracted modules.
- The Notebook becomes the artifact hub:
  - Chart cells support every chart kind: the 8 Recharts kinds plus the echarts-only kinds (scatter, heatmap, funnel, treemap, gauge) via an extracted pure `buildChartOption`, plus a KPI tile. Table stays the grid default; markdown and mermaid cells are unchanged.
  - The chart-kind picker is a dropdown of visual tiles (the existing hand-drawn SVG mini-chart art), one per kind — pictures with names, not a text list.
  - Each SQL cell can choose which connected database it runs against (default: the active connection).
  - Every cell (and the notebook toolbar) has "Ask exa": it opens the assistant and sends a prompt carrying the cell's SQL and chart kind so exa can create or modify the design. This also repairs the currently-dead prompt path (the editor AI actions write state nothing reads).
  - A "System" button at the bottom of the notebook lists the three System dashboards (Query performance, Sessions, DB size) and opens each as an auto-running notebook.
- The `/v1/dashboards` API, agent tools, and store stay: agent-built dashboards remain importable into the notebook (the existing import seam), and the exa web build keeps its compat surface.

## Capabilities

### New Capabilities
- `notebook-artifact-hub`: the notebook as single artifact surface — full chart-kind coverage with a visual picker, per-cell connection choice, exa prompt integration, System dashboard entry point.

### Modified Capabilities
<!-- none tracked as existing specs -->

### Removed Capabilities
- Dashboards as a standalone activity/tab (feature UI removed; server API retained).

## Non-goals

- No change to `/v1/dashboards` storage, zod schema, revision history, or the System-dashboard server-side locks.
- No per-panel grid layout in the notebook (cells stay a vertical document).
- No new persistence backend for notebooks (localStorage stays).
- The Perspective "explore" pivot panel is not ported into the notebook.

## Impact

- `apps/desktop/src/features/workbench/NotebookTab.tsx` grows the picker, per-cell connection, KPI/echarts rendering, System button, Ask-exa.
- New pure modules extracted from `Dashboards.tsx` before its deletion: `features/bi/chart-option.ts` (+ tests), `features/bi/viz-tiles.tsx`, `features/bi/system-dashboards.ts`.
- `ExaThread.tsx` gains an `exa:prompt` CustomEvent handler (setText + send), the seam all features use to talk to exa.
- Shell cleanup shrinks `ExasolStudio.tsx`, `tabs.ts`, `ActivityRail.tsx`, `workspace-persist.ts`.
- Docs: `docs/site/dashboards.mdx` folds into the notebook page.
