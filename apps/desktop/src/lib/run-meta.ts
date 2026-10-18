// Which statement a tab's grid came from. A run may have been a selection or
// the statement at the cursor, and the buffer may have moved on since; the
// grid belongs to what RAN, so a refresh after saving edits must re-run that,
// never the whole editor buffer (which could re-execute writes).

export function sqlBehindGrid(tab: { sql: string; runMeta?: { sql?: string } | null }): string {
  const ran = tab.runMeta?.sql?.trim();
  return ran ? ran : tab.sql;
}
