// What the canvas is worth drawing at a given zoom.
//
// Two tiers, decided by how many SCREEN pixels a column row actually occupies
// — not by a magic zoom number, which goes stale the moment a row height
// changes. Above the threshold the cards are read; below it they are a map,
// and what has to be legible is which schema you are looking at.

/** A row thinner than this paints glyphs nobody can resolve. Deliberately
 *  low: the cards are what people come to the diagram for, so they stay on
 *  until a row really is a hairline. */
export const LEGIBLE_ROW_PX = 4;

/** Screen height of one column row at this zoom. */
export const rowScreenPx = (zoom: number, rowHeight: number): number => zoom * rowHeight;

/** True once the cards stop being readable: rows go blank, schema boxes and
 *  their names take over (see the `.is-far` rules in global.css). */
export function isFarZoom(zoom: number, rowHeight: number): boolean {
  return rowScreenPx(zoom, rowHeight) < LEGIBLE_ROW_PX;
}

/** The zoom at which the switch happens, for a fit that wants to stay readable. */
export const farZoomThreshold = (rowHeight: number): number => LEGIBLE_ROW_PX / rowHeight;

/** Guards the CSS divisor: `calc(2px / var(--vs-zoom))` must never divide by 0. */
export const zoomVar = (zoom: number): string => String(Math.max(zoom, 0.01));

/** How wide a character is, relative to the font size, in the bold face the
 *  map label uses. Measured against the schema names this app shows. */
const CHAR_RATIO = 0.62;
/** The label never takes more than this share of its box's height. The label
 *  is ~2.9 lines tall once its second line and padding are counted, so this
 *  keeps the whole pill inside the box. */
const HEIGHT_SHARE = 0.32;

/**
 * The largest font a schema's name may take, in GRAPH units, so that the name
 * stays inside its own box.
 *
 * Zoomed out the label is sized in screen pixels, which is what makes it
 * readable at any zoom — but a schema with two tables has a small box, and a
 * constant-size name on it is wider than the box and lands on top of the
 * schemas beside it. This is the cap that keeps every name at home.
 */
export function nameFontLimit(boxWidth: number, boxHeight: number, nameLength: number): number {
  const byWidth = boxWidth / Math.max(1, nameLength * CHAR_RATIO);
  const byHeight = boxHeight * HEIGHT_SHARE;
  return Math.max(1, Math.min(byWidth, byHeight));
}

/** The label's font: the constant screen size, but never wider than its box. */
export const nameFontCss = (limit: number, screenPx: number): string =>
  `min(calc(${screenPx}px / var(--vs-zoom)), ${limit.toFixed(2)}px)`;
