// The app's single widget registry, wiring each type to its renderer. New widget
// kinds are added HERE (one register call) — the model and the document schema
// never change. Kept apart from registry.ts so that pure module stays React-free
// and unit-testable.

import { createRegistry, type WidgetRegistry } from "./registry";
import type { WidgetRender } from "./presentation";
import { ChartWidget, KpiWidget, TableWidget, MarkdownWidget, FilterWidget, SearchWidget, PlaceholderWidget } from "./widgets";

export const widgetRegistry: WidgetRegistry<WidgetRender> = createRegistry<WidgetRender>((ctx) => PlaceholderWidget(ctx));

widgetRegistry.register({ type: "markdown", label: "Text", render: (ctx) => MarkdownWidget(ctx) });
widgetRegistry.register({ type: "kpi", label: "KPI", dataBacked: true, render: (ctx) => KpiWidget(ctx), defaultProps: { query: "" } });
widgetRegistry.register({ type: "chart", label: "Chart", dataBacked: true, render: (ctx) => ChartWidget(ctx), defaultProps: { kind: "bar" } });
widgetRegistry.register({ type: "table", label: "Table", dataBacked: true, render: (ctx) => TableWidget(ctx) });
widgetRegistry.register({ type: "filter", label: "Filter", render: (ctx) => FilterWidget(ctx) });
widgetRegistry.register({ type: "search", label: "Search", render: (ctx) => SearchWidget(ctx) });
