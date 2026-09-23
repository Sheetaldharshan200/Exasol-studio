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

/** Roughly how wide a character is, relative to the font size, in the bold
 *  face the tab uses. Measured against the schema names this app shows. */
const CHAR_RATIO = 0.62;
/** Padding and border, as a share of the font size (see the .vs-tab rule). */
const CHROME_RATIO = 1.4;
/** How far a tab may reach past its own box before it would meet the next
 *  one. Boxes are laid out a fixed gap apart; most of that gap is fair game. */
const GAP_SHARE = 0.8;

/**
 * The largest font the tab may use, in GRAPH units, so the WHOLE name fits.
 *
 * Truncating is not an option here: "SEMANTI…" is the same label on
 * SEMANTIC_AGENT and SEMANTIC_CATALOG, which is worse than a small name — the
 * tab exists precisely to tell them apart. So the name is never cut; the type
 * shrinks instead, and only as far as it must, because a tab may use the gap
 * beside its box as well as the box itself.
 */
export function tabFontLimit(boxWidth: number, nameLength: number, gap: number): number {
  const room = boxWidth + Math.max(0, gap) * GAP_SHARE;
  const perChar = Math.max(1, nameLength) * CHAR_RATIO + CHROME_RATIO;
  return Math.max(1, room / perChar);
}

/** The tab's font: the constant screen size, but never wider than its room. */
export const tabFontCss = (limit: number, screenPx = TABLE_NAME_PX): string =>
  `min(calc(${screenPx}px / var(--vs-zoom)), ${limit.toFixed(2)}px)`;
