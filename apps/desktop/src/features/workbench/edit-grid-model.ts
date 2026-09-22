// The pure decisions behind the editable results grid: what a staged change
// set amounts to, and what a duplicated row starts out as. Kept out of the
// component so both can be tested without a DOM.

/** A staged row's cells. Three states, and the difference matters in the
 *  generated INSERT: a string is that value, `null` is an explicit SQL NULL,
 *  and an absent or empty entry is left out of the statement so the column
 *  takes its default. */
export type Draft = Record<string, string | null>;

/** Is this cell written into the INSERT at all? */
export const isWritten = (v: string | null | undefined): boolean => v === null || (v ?? "") !== "";

/** A new row seeded from an existing one, the way DataGrip and DBeaver clone:
 *  every value copied as text. A NULL copies as an explicit NULL, not as an
 *  empty cell — a cloned row of a column that has a DEFAULT must come out as
 *  the NULL it was, not as the default. Key columns come across too: the row
 *  is staged, not written, so the user changes them before saving. */
export function rowToDraft(row: readonly unknown[], columns: readonly { name: string }[]): Draft {
  const draft: Draft = {};
  columns.forEach((col, i) => {
    const v = row[i];
    draft[col.name] = v === null || v === undefined ? null : String(v);
  });
  return draft;
}

export type Staged = {
  /** rowIndex -> colIndex -> new value. */
  edits: Record<number, Record<number, string>>;
  deleted: ReadonlySet<number>;
  inserts: readonly unknown[];
};

/** How many rows a save would touch. A row counts once however many of its
 *  cells were edited, and a deleted row is not also counted as edited. */
export function pendingCount({ edits, deleted, inserts }: Staged): number {
  const editedRows = Object.keys(edits).filter(
    (r) => !deleted.has(Number(r)) && Object.keys(edits[Number(r)] ?? {}).length > 0,
  ).length;
  return editedRows + deleted.size + inserts.length;
}

/** "2 edited · 1 new · 1 deleted" — null when nothing is staged. */
export function pendingSummary(staged: Staged): string | null {
  if (pendingCount(staged) === 0) return null;
  const edited = Object.keys(staged.edits).filter(
    (r) => !staged.deleted.has(Number(r)) && Object.keys(staged.edits[Number(r)] ?? {}).length > 0,
  ).length;
  const parts: string[] = [];
  if (edited) parts.push(`${edited} edited`);
  if (staged.inserts.length) parts.push(`${staged.inserts.length} new`);
  if (staged.deleted.size) parts.push(`${staged.deleted.size} deleted`);
  return parts.join(" · ");
}
