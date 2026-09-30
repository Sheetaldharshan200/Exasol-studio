// The saved canvas: one document per connection in localStorage. Results are
// never saved — a box is re-run when it is looked at again.

import { EMPTY_DOC, type Box, type CanvasDoc, type Rect } from "./model.ts";

export const STORAGE_PREFIX = "exa.canvas.";

export function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`;
}

function isRect(v: unknown): v is Rect {
  const r = v as Rect;
  return !!r && [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n)) && r.w > 0 && r.h > 0;
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** One stored box, or null when it is not one Studio knows how to draw. */
export function decodeBox(v: unknown): Box | null {
  const b = v as Record<string, unknown>;
  if (!b || !str(b.id) || !str(b.profileId) || !str(b.connectionName) || !isRect(b.rect)) return null;
  const common = { id: b.id, profileId: b.profileId, connectionName: b.connectionName, rect: b.rect };
  switch (b.kind) {
    case "table":
      return str(b.schema) && str(b.table)
        ? { ...common, kind: "table", schema: b.schema, table: b.table, ...(typeof b.rowCount === "number" ? { rowCount: b.rowCount } : {}) }
        : null;
    case "query":
      return str(b.name) && typeof b.sql === "string" && Array.isArray(b.sources) && b.sources.every(str)
        ? { ...common, kind: "query", name: b.name, sql: b.sql, sources: b.sources as string[], ...(b.rowsBehind === true ? { rowsBehind: true } : {}) }
        : null;
    case "chart": {
      const viz = (b.viz ?? {}) as Record<string, unknown>;
      return str(b.name) && str(b.source) && str(b.chart)
        ? {
            ...common,
            kind: "chart",
            name: b.name,
            source: b.source,
            chart: b.chart,
            viz: {
              ...(str(viz.xField) ? { xField: viz.xField } : {}),
              ...(Array.isArray(viz.yFields) ? { yFields: viz.yFields.filter(str) } : {}),
              ...(typeof viz.stacked === "boolean" ? { stacked: viz.stacked } : {}),
              ...(viz.option && typeof viz.option === "object" ? { option: viz.option as Record<string, unknown> } : {}),
            },
          }
        : null;
    }
    default:
      return null;
  }
}

/**
 * A document from its stored text. Boxes that cannot be drawn are dropped,
 * and so are steps or charts whose every source is gone — an arrow to
 * nothing is worse than a missing box.
 */
export function decodeDoc(raw: string | null | undefined): CanvasDoc {
  if (!raw) return EMPTY_DOC;
  try {
    const v = JSON.parse(raw) as { version?: unknown; boxes?: unknown };
    if (!v || !Array.isArray(v.boxes)) return EMPTY_DOC;
    const boxes = v.boxes.map(decodeBox).filter((b): b is Box => b !== null);
    const ids = new Set(boxes.map((b) => b.id));
    const kept = boxes.filter((b) => (b.kind === "query" ? b.sources.every((s) => ids.has(s)) : b.kind === "chart" ? ids.has(b.source) : true));
    // Dropping one box can orphan another: settle.
    return kept.length === boxes.length ? { version: 1, boxes: kept } : decodeDoc(JSON.stringify({ version: 1, boxes: kept }));
  } catch {
    return EMPTY_DOC;
  }
}

export function encodeDoc(doc: CanvasDoc): string {
  return JSON.stringify({ version: 1, boxes: doc.boxes });
}

export function loadDoc(profileId: string): CanvasDoc {
  try {
    return decodeDoc(localStorage.getItem(storageKey(profileId)));
  } catch {
    return EMPTY_DOC;
  }
}

export function saveDoc(profileId: string, doc: CanvasDoc): void {
  try {
    if (doc.boxes.length) localStorage.setItem(storageKey(profileId), encodeDoc(doc));
    else localStorage.removeItem(storageKey(profileId));
  } catch {
    /* storage unavailable: the canvas still works for the session */
  }
}
