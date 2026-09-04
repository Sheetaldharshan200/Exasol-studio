// The open widget registry. Widget kinds are keyed by their string `type`; a new
// kind is added by registering a definition, never by editing an enum in the
// model. The document is free to contain a type that is not registered — resolve
// falls back to a placeholder so one unknown widget can never break a dashboard.
//
// Deliberately React-free: a definition's `render`/`editor` are opaque here so
// this module (and its tests) never import the UI layer. The .tsx layer supplies
// the actual React renderers by calling `register` on the shared registry.

export type WidgetDef<R = unknown> = {
  type: string;
  /** Human label for the "add widget" palette. */
  label: string;
  /** The renderer — a React component, supplied by the UI layer. */
  render: R;
  /** Default props applied when this widget is added. */
  defaultProps?: Record<string, unknown>;
  /** Optional inline editor component. */
  editor?: R;
  /** True when the widget runs a SQL query (chart, kpi, table, …). */
  dataBacked?: boolean;
};

export const PLACEHOLDER_TYPE = "__unsupported__";

export type WidgetRegistry<R = unknown> = {
  register: (def: WidgetDef<R>) => void;
  get: (type: string) => WidgetDef<R> | undefined;
  /** Never returns undefined: an unknown type resolves to the placeholder def. */
  resolve: (type: string) => WidgetDef<R>;
  has: (type: string) => boolean;
  list: () => WidgetDef<R>[];
};

/** Create an isolated registry (used by tests so they don't share global state). */
export function createRegistry<R = unknown>(placeholderRender: R): WidgetRegistry<R> {
  const defs = new Map<string, WidgetDef<R>>();
  const placeholder: WidgetDef<R> = { type: PLACEHOLDER_TYPE, label: "Unsupported widget", render: placeholderRender };

  return {
    register(def) {
      if (!def.type || !def.type.trim()) throw new Error("widget def requires a non-empty type");
      defs.set(def.type, def);
    },
    get: (type) => defs.get(type),
    resolve: (type) => defs.get(type) ?? placeholder,
    has: (type) => defs.has(type),
    list: () => [...defs.values()],
  };
}
