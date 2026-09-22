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
