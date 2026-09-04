// The contract between the canvas host and a widget renderer. The host owns data
// (runs the query, holds edit mode) and hands the renderer everything it needs;
// a renderer is a pure function of this context, which is why the registry can
// stay React-free and the renderers live in the .tsx layer.

import type { ReactNode } from "react";
import type { DashboardDoc, Widget } from "./model";
import type { WidgetData } from "./useWidgetData";

export type WidgetRenderContext = {
  widget: Widget;
  doc: DashboardDoc;
  /** Query state for data-backed widgets; `{loading:false}` for the rest. */
  data: WidgetData;
  /** True in canvas edit mode — renderers show inline editing affordances. */
  editing: boolean;
  /** Write a dashboard parameter (filter/search widgets). */
  setParam: (name: string, value: string | number | null) => void;
  /** Patch this widget's props (inline text edit, etc.). */
  onProps: (patch: Record<string, unknown>) => void;
};

export type WidgetRender = (ctx: WidgetRenderContext) => ReactNode;
