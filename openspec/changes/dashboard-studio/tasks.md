## 1. Phase 1 — Document model & renderer (canvas)

- [ ] 1.1 Create `apps/desktop/src/features/dashboard/model.ts` with the `DashboardDoc`/`Widget` types and pure `applyOp(doc, op)` (create, add_widget, update_widget, set_layout, set_param, restyle, remove_widget), returning `{doc, error?}`. Verify with `model.test.ts` covering each op plus rejection paths (unknown widget id, unknown target, empty doc) — `pnpm test:agent-core`-style `node:test`.
- [ ] 1.2 Create `features/dashboard/params.ts` with pure `bindParams(query, params)` returning bound SQL + used param names. Verify `params.test.ts`: no params, missing param, `:name` substitution, quoting/escape, Exasol identifier case-fold.
- [ ] 1.3 Create `features/dashboard/registry.ts` (open `type -> {render, defaultProps, editor?}`) with markdown/text, chart, KPI, table, filter, search renderers registered; unknown type resolves to a placeholder renderer. Verify a small `registry.test.ts` asserts lookup + placeholder fallback for an unknown type.
- [ ] 1.4 Build `DashboardCanvas.tsx` + `WidgetFrame.tsx`: freeform grid with drag/resize, theme/color styling, "Show query" reveal per widget. Verify by rendering a sample doc in a vite dev build and confirming widgets render, drag/resize persists to the doc, and unknown-type shows the placeholder.
- [ ] 1.5 Wire the notebook view as a second renderer over the same doc (linear, run-order; ignores `layout`); add the view toggle. Verify a doc round-trips notebook↔canvas with no widget/query/result loss (assert in a `view-model.test.ts` on the pure mapping).
- [ ] 1.6 Persistence: Rust reads/writes `dashboards/<id>.json` (doc + per-widget result cache + lastRefreshed) under the app data dir; pure serializer/migrator in `features/dashboard/store.ts`. Verify `store.test.ts` (serialize/parse round-trip, forward-compatible unknown fields) and an observable reopen showing cache before queries run.

## 2. Phase 2 — Assistant control (AI-manipulable)

- [ ] 2.1 Add a `dashboard` tool to `packages/agent-core/src/tools.ts` whose calls map 1:1 to `applyOp` operations; document the op schema for the model. Verify `tools`-style test asserting each op name is accepted and an unknown op is rejected.
- [ ] 2.2 Add a `dashboard.*` action family to `studio-actions.ts` + `studio-action-names.ts` (create, add_widget, set_layout, set_param, restyle, remove_widget) that applies the op to the live doc and persists; keep the allow-list closed. Verify extends `studio-actions.test.ts` (names present, unknown rejected).
- [ ] 2.3 Route the tool through the existing gateway/bridge so the webview receives and applies ops; unknown widget/target returns a message and leaves the doc unchanged. Verify end-to-end: ask the assistant to "add a bar chart of X by Y" and confirm a chart widget appears and is saved; a bad target op leaves the dashboard unchanged.
- [ ] 2.4 Make an assistant "create a dashboard" request emit a canvas doc (narrative + KPIs + charts, queries collapsed) instead of a linear notebook; notebook requests still produce a notebook. Verify by prompting each and observing the resulting artifact type.

## 3. Phase 3 — Live refresh

- [ ] 3.1 Add `packages/agent-core/src/dashboard-refresh.ts`: pure `due(widgets, now, lastRun, invalidatedParams)` returning which widgets to re-run; the timer shell calls it. Verify `dashboard-refresh.test.ts` (interval elapsed, opted-out widget, param-invalidation, floor enforcement).
- [ ] 3.2 Arm the scheduler on sidecar start from each saved dashboard's refresh config; a tick re-runs the bound query, pushes the result to the webview, updates the cache and `lastRefreshed`; a failed tick keeps the last result and flags the error. Verify: enable 30s refresh, observe widgets update and `lastRefreshed` advance; kill the connection and confirm the widget keeps data + shows the error.
- [ ] 3.3 Per-dashboard and per-widget auto-refresh toggle + interval UI, persisted and re-armed on reopen. Verify: enable refresh, close and reopen the app, confirm refresh resumes without re-enabling.

## 4. Phase 4 — Sharing

- [ ] 4.1 `features/dashboard/snapshot.ts`: pure `buildSnapshot(doc, cache) -> {html, md}` extending `bi/report-export.ts`; PDF via the existing print path. Verify `snapshot.test.ts` renders a sample offline (no server/DB) with escaping correct.
- [ ] 4.2 Sidecar read-only share route serving one dashboard with strong gating: a high-entropy per-share token (Rust-minted) required on the page AND every sub-request (asset/data/api); token scoped to one dashboard, no ambient authority; wrong/unknown token returns an identical constant-time refusal (no share-existence probing); no route enumerates dashboards/shares; the payload carries only rendered results (never widget SQL, connection string, or credentials). Verify: with token → 200; without/wrong → identical refusal; token for A refused on B; payload asserted free of SQL/credentials; sub-request without token refused.
- [ ] 4.6 Owner can revoke and rotate a share; the prior link stops working after either. Verify: revoke → old link refused; rotate → old link refused and only the new link works.
- [ ] 4.3 Bundle/fetch `cloudflared` (first use of public sharing, checksum-verified, per-platform) launched by Rust in front of the share route; Quick (ephemeral) and Stable (named, persisted credentials) modes. Verify: Quick produces a working public URL with nothing pre-installed; Stable returns the same URL after app restart.
- [ ] 4.4 Publish the last static snapshot for a share as the offline fallback; serve it while the app is off and switch back to live on reopen. Verify: open a stable link with the owner app closed → snapshot shown; reopen owner app → link serves live data.
- [ ] 4.5 Share UI: opt-in, off by default, shows the read-only/internet-exposure notice before creating a link; Quick vs Stable choice; copy link. Verify sharing is off until enabled and the notice is shown before a link exists.

## 5. Quality gate

- [ ] 5.1 Run the full suite green: `pnpm test` (agent-core + parser + Rust) and the desktop `node:test` glob; tsc + a real vite production build + `cargo test`. Verify all pass with the new tests included.
- [ ] 5.2 Codex-review the diff (`/codex:rescue`), apply valid findings, and record notable findings + fixes in `knowledge/wiki`. Verify the review is clean or findings are resolved before shipping.
- [ ] 5.3 Refresh the knowledge graphs (`graphify update .`, `/understand-anything:understand`) and commit the updated `.ua/` and `graphify-out/graph.json`. Verify the graphs include the new `features/dashboard/` modules.
