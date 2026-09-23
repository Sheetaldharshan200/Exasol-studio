// The schema name, kept readable while the diagram is not.
//
// Every table card is drawn at every zoom — that is deliberate, and it is what
// the diagram is for. But zoomed out far enough, a table's own name is a few
// pixels tall and the box's title strip shrinks with it, so you can see the
// shape of a schema without being able to tell WHICH schema it is. A tab above
// the box carries the name at a constant screen size until the table names
// themselves are comfortable to read, and then gets out of the way.
//
// Nothing is hidden by this: it is a label, not a level of detail.

/** The table-name type size on a card, in graph units. */
export const TABLE_NAME_PX = 13;
/** Below this many screen pixels a name is shape, not text. */
export const COMFORTABLE_PX = 7;

/** How tall a table's name renders on screen at this zoom. */
export const nameScreenPx = (zoom: number, namePx = TABLE_NAME_PX): number => zoom * namePx;

/** Should the schema's name tab be showing? True until the table names on the
 *  cards are comfortable to read on their own. */
export function showSchemaTab(zoom: number, namePx = TABLE_NAME_PX): boolean {
  return nameScreenPx(zoom, namePx) < COMFORTABLE_PX;
}

/** The zoom at which the tab gives way to the cards' own names. */
export const tabThreshold = (namePx = TABLE_NAME_PX): number => COMFORTABLE_PX / namePx;

/** Guards the CSS divisor: `calc(13px / var(--vs-zoom))` must never divide by 0. */
export const zoomVar = (zoom: number): string => String(Math.max(zoom, 0.01));
