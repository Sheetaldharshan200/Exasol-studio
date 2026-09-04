## Why

When a user asks the exa assistant to "create a dashboard," it produces a linear notebook — a
developer artifact (SQL cells, one after another), not something a non-developer reads and
understands. Studio needs a real dashboard surface: an attractive, freeform, rearrangeable
canvas of narrative text, charts, KPIs, and filters that a user just *reads* — while the SQL
stays available for developers underneath. Crucially, the assistant must be able to author and
edit that dashboard as easily as it writes a query, and dashboards must be shareable — including
live, over the internet — so an analysis leaves the machine it was built on.

## What Changes

- **Freeform dashboard canvas.** A dashboard is a declarative JSON document (the single source of
  truth) that both the assistant and the user edit; a renderer draws it. Widgets live on a
  grid — drag, resize, colors/theme — instead of a linear cell stack. The notebook remains a
  linear/run-order view over the same block model; the dashboard is the freeform view.
- **Open widget registry.** Widget kinds (markdown/text, chart, KPI, table, filter, search,
  divider, image, …) come from an extensible registry — adding a kind is registering a renderer,
  not editing a fixed enum. Nothing restricts the author to a closed set.
- **Interactivity.** Dashboard-level `params` plus filter/search widgets drive cross-filtering
  (queries reference `:param` and re-run) and drill-down.
- **AI-manipulable (primary goal).** The assistant edits the JSON via patches, never the DOM: a
  new `dashboard` engine tool (create / patch / add_widget / set_layout / set_param / restyle)
  and a `dashboard.*` action family on the existing app-control bridge. Developers expand the SQL
  per widget; users see only the narrative and charts.
- **Persistence & lifecycle.** Dashboards are saved to disk and survive shutdown — they reopen
  identical, show a cached last-result immediately, then refresh. **BREAKING:** the current
  "AI request for a dashboard → linear notebook" behavior is replaced by "→ canvas dashboard."
- **Live data.** A refresh scheduler inside the existing agent-core sidecar (no new process):
  per-dashboard/per-widget auto-refresh toggle + interval, re-armed from saved config on reopen.
  Runs only while the app is open (stated non-goal below covers always-on).
- **Sharing.** (a) Snapshot export to HTML / PDF / MD (reusing `bi/report-export.ts`); (b) LAN
  live share — read-only, token'd, served by the sidecar's existing web tier; (c) public internet
  share via a **bundled** cloudflared tunnel (fetched like the Node runtime, so no user install),
  in Quick (ephemeral URL) and Stable (persistent same URL) modes, with the last static snapshot
  published at the link as an offline fallback. All live sharing is read-only, token-gated, and
  opt-in.

## Capabilities

### New Capabilities
- `dashboard-canvas`: the freeform dashboard document — JSON model, open widget registry,
  grid layout with drag/resize/colors, params + cross-filtering + drill-down, AI patch tool and
  `dashboard.*` app-control actions, and on-disk persistence with a last-result cache.
- `dashboard-live-refresh`: the sidecar-hosted refresh scheduler — per-dashboard/per-widget
  auto-refresh toggle and interval, persisted and re-armed on reopen; app-open-only semantics.
- `dashboard-sharing`: snapshot export (HTML/PDF/MD), LAN live share, and public tunnel sharing
  (bundled cloudflared, Quick/Stable URL modes, offline snapshot fallback), all read-only,
  token-gated, and opt-in.

### Modified Capabilities
- `notebook-artifact-hub`: an assistant request to create a dashboard SHALL produce a
  `dashboard-canvas` document rather than a linear notebook; the notebook and the canvas SHALL
  share one block/widget model, and a document SHALL be viewable either way.

## Impact

- **New code:** `apps/desktop/src/features/dashboard/` — pure `model.ts` (document, patch/apply,
  param binding, layout math), a widget registry, a renderer, and an editor. New pure logic is
  unit-tested with `node:test`. Must NOT grow `ExasolStudio.tsx` or the ~2,000-line
  `Dashboards.tsx`.
- **Engine (`packages/agent-core`):** new `dashboard` tool in `tools.ts`; a refresh scheduler
  module; new gateway routes for the `dashboard.*` bridge actions and for live-share serving;
  cloudflared runtime fetch alongside the existing Node/exapump runtime provisioning.
- **App-control bridge:** a `dashboard.*` action family added to `studio-actions.ts` /
  `studio-action-names.ts`.
- **Rust (`src-tauri`):** cloudflared binary bundling/launch and tunnel lifecycle; dashboard file
  persistence under the app data dir; token minting for shared links.
- **Reuse:** `bi/report-export.ts` (markdown→HTML/MD export), existing echarts chart panels, and
  the sidecar's existing web transport tier (`web-gateway.json`).
- **Dependencies:** cloudflared (bundled/fetched, not a user-installed prerequisite). No nginx
  dependency. No new UI framework.
- **Conventions:** icons only (no emoji); edit-in-place (no CRUD dialogs); one frontend build for
  desktop/web.
