// The dashboard document model — the single source of truth a dashboard is.
//
// A dashboard is plain data: a title, a theme, named params, and an ordered list
// of widgets. The renderer, the notebook view, the user's editor, and the exa
// assistant all operate on THIS shape; there is no second representation to keep
// in sync. Every edit — whether a drag in the UI or a call from the assistant —
// is expressed as an Op and applied by the pure `applyOp` below, so the same
// document always produces the same dashboard and every edit is testable without
// mounting the app.

/** Grid position of a widget, in grid cells. */
export type Layout = { x: number; y: number; w: number; h: number };

/** Free-form styling bag; renderers read what they understand. */
export type Style = Record<string, string | number>;

/** Dashboard-level styling. */
export type Theme = { accent?: string; density?: "comfortable" | "compact" } & Style;

/** A named dashboard parameter that filter/search widgets write and queries read. */
export type Param = {
  name: string;
  type: "text" | "number" | "select" | "date";
  value?: string | number | null;
  default?: string | number | null;
  options?: Array<string | number>;
};

/**
 * A widget. `type` is an OPEN string keyed into the widget registry — the model
 * deliberately does NOT enumerate types, so a new kind is a registered renderer,
 * not a change here. `query` is present only on data-backed widgets.
 */
export type Widget = {
  id: string;
  type: string;
  layout: Layout;
  style?: Style;
  props?: Record<string, unknown>;
  query?: string;
};

export type DashboardDoc = {
  id: string;
  title: string;
  theme: Theme;
  params: Param[];
  widgets: Widget[];
  /** When set, this dashboard is a synced child of a notebook (one-way): its
   *  content is derived from that notebook and edited THERE, not here. */
  sourceNotebook?: string;
};

/** Operations the UI and the assistant use to edit a document. */
/** A widget edit — layout is a PARTIAL so callers can change just h, just w, etc. */
export type WidgetPatch = Partial<Omit<Widget, "id" | "layout">> & { layout?: Partial<Layout> };

export type Op =
  | { op: "create"; id?: string; title?: string; theme?: Theme }
  | { op: "set_title"; title: string }
  | { op: "add_widget"; widget: Partial<Widget> & { type: string } }
  | { op: "update_widget"; id: string; patch: WidgetPatch }
  | { op: "set_layout"; id: string; layout: Partial<Layout> }
  | { op: "remove_widget"; id: string }
  | { op: "set_param"; param: Partial<Param> & { name: string } }
  | { op: "restyle"; id?: string; style: Style };

export type ApplyResult = { doc: DashboardDoc; error?: string };

const DEFAULT_LAYOUT: Layout = { x: 0, y: 0, w: 4, h: 3 };

/** A fresh, empty document. */
export function emptyDoc(id: string, title = "Untitled dashboard"): DashboardDoc {
  return { id, title, theme: { accent: "#2f6bff", density: "comfortable" }, params: [], widgets: [] };
}

/**
 * Derive the next widget id deterministically from the ids already present
 * (`w1`, `w2`, …). Pure — no clock, no randomness — so applying the same ops to
 * the same document always yields the same ids, which keeps tests and the
 * notebook↔canvas round-trip stable.
 */
function nextWidgetId(widgets: Widget[]): string {
  let max = 0;
  for (const w of widgets) {
    const m = /^w(\d+)$/.exec(w.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `w${max + 1}`;
}

/** Deep-ish clone that is enough for the plain-data document. */
function cloneDoc(doc: DashboardDoc): DashboardDoc {
  return {
    id: doc.id,
    title: doc.title,
    theme: { ...doc.theme },
    sourceNotebook: doc.sourceNotebook,
    params: doc.params.map((p) => ({ ...p, options: p.options ? [...p.options] : undefined })),
    widgets: doc.widgets.map((w) => ({
      ...w,
      layout: { ...w.layout },
      style: w.style ? { ...w.style } : undefined,
      props: w.props ? { ...w.props } : undefined,
    })),
  };
}

const ok = (doc: DashboardDoc): ApplyResult => ({ doc });
const fail = (doc: DashboardDoc, error: string): ApplyResult => ({ doc, error });

/**
 * Apply one edit to a document, returning a NEW document (the input is never
 * mutated). On any invalid op — unknown widget id, missing field — the original
 * document is returned unchanged together with an `error` message, so a bad edit
 * from the assistant or the UI fails cleanly instead of corrupting the dashboard.
 */
export function applyOp(doc: DashboardDoc, op: Op): ApplyResult {
  switch (op.op) {
    case "create": {
      const next = emptyDoc(op.id ?? doc.id, op.title ?? "Untitled dashboard");
      if (op.theme) next.theme = { ...next.theme, ...op.theme };
      return ok(next);
    }

    case "set_title": {
      const next = cloneDoc(doc);
      next.title = op.title;
      return ok(next);
    }

    case "add_widget": {
      if (!op.widget || typeof op.widget.type !== "string" || op.widget.type.trim() === "") {
        return fail(doc, "add_widget requires a widget with a non-empty type");
      }
      const next = cloneDoc(doc);
      const id = op.widget.id && op.widget.id.trim() ? op.widget.id : nextWidgetId(next.widgets);
      if (next.widgets.some((w) => w.id === id)) return fail(doc, `a widget with id "${id}" already exists`);
      next.widgets.push({
        id,
        type: op.widget.type,
        layout: { ...DEFAULT_LAYOUT, ...(op.widget.layout ?? {}) },
        style: op.widget.style,
        props: op.widget.props,
        query: op.widget.query,
      });
      return ok(next);
    }

    case "update_widget": {
      const idx = doc.widgets.findIndex((w) => w.id === op.id);
      if (idx < 0) return fail(doc, `no widget with id "${op.id}"`);
      const next = cloneDoc(doc);
      const cur = next.widgets[idx];
      const { layout, style, props, ...rest } = op.patch;
      next.widgets[idx] = {
        ...cur,
        ...rest,
        layout: layout ? { ...cur.layout, ...layout } : cur.layout,
        style: style ? { ...(cur.style ?? {}), ...style } : cur.style,
        props: props ? { ...(cur.props ?? {}), ...props } : cur.props,
      };
      return ok(next);
    }

    case "set_layout": {
      const idx = doc.widgets.findIndex((w) => w.id === op.id);
      if (idx < 0) return fail(doc, `no widget with id "${op.id}"`);
      const next = cloneDoc(doc);
      next.widgets[idx].layout = { ...next.widgets[idx].layout, ...op.layout };
      return ok(next);
    }

    case "remove_widget": {
      const idx = doc.widgets.findIndex((w) => w.id === op.id);
      if (idx < 0) return fail(doc, `no widget with id "${op.id}"`);
      const next = cloneDoc(doc);
      next.widgets.splice(idx, 1);
      return ok(next);
    }

    case "set_param": {
      if (!op.param || typeof op.param.name !== "string" || op.param.name.trim() === "") {
        return fail(doc, "set_param requires a param with a non-empty name");
      }
      const next = cloneDoc(doc);
      const idx = next.params.findIndex((p) => p.name === op.param.name);
      if (idx < 0) {
        next.params.push({ name: op.param.name, type: op.param.type ?? "text", value: op.param.value ?? op.param.default ?? null, default: op.param.default ?? null, options: op.param.options });
      } else {
        next.params[idx] = { ...next.params[idx], ...op.param };
      }
      return ok(next);
    }

    case "restyle": {
      const next = cloneDoc(doc);
      if (op.id === undefined) {
        next.theme = { ...next.theme, ...op.style };
        return ok(next);
      }
      const idx = next.widgets.findIndex((w) => w.id === op.id);
      if (idx < 0) return fail(doc, `no widget with id "${op.id}"`);
      next.widgets[idx].style = { ...(next.widgets[idx].style ?? {}), ...op.style };
      return ok(next);
    }

    default: {
      // Exhaustiveness guard: an unknown op type leaves the doc untouched.
      return fail(doc, `unknown op "${(op as { op?: string }).op ?? "?"}"`);
    }
  }
}

/** Apply a sequence of ops, stopping at the first error. */
export function applyOps(doc: DashboardDoc, ops: Op[]): ApplyResult {
  let cur = doc;
  for (const op of ops) {
    const res = applyOp(cur, op);
    if (res.error) return res;
    cur = res.doc;
  }
  return ok(cur);
}
