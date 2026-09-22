/**
 * Viewport maths for the schema diagram — pure, so the "click a table and it
 * comes into view" behaviour is testable without React Flow.
 */
export type Box = { id: string; x: number; y: number; width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The rectangle covering a table and every table it is linked to (one hop),
 * padded. `null` when the id is unknown. The caller hands this to React Flow's
 * `fitBounds`, which derives the zoom from the rectangle — never a fixed zoom,
 * so one lonely table fills the view and a hub with eight neighbours zooms out
 * far enough to show them all.
 */
export function focusBounds(
  boxes: Box[],
  links: { source: string; target: string }[],
  id: string,
  pad = 40,
): Rect | null {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const centre = byId.get(id);
  if (!centre) return null;
  const members = [centre];
  for (const l of links) {
    const other = l.source === id ? l.target : l.target === id ? l.source : null;
    if (!other || other === id) continue;
    const box = byId.get(other);
    if (box && !members.includes(box)) members.push(box);
  }
  const x0 = Math.min(...members.map((b) => b.x)) - pad;
  const y0 = Math.min(...members.map((b) => b.y)) - pad;
  const x1 = Math.max(...members.map((b) => b.x + b.width)) + pad;
  const y1 = Math.max(...members.map((b) => b.y + b.height)) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
