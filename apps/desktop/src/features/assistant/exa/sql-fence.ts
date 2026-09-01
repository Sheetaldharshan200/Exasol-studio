// The assistant's FINAL ```sql fence — what the pin auto-apply writes back
// into the pinned query tab or notebook cell. Pure and tested.

export function lastSqlFence(text: string): string | null {
  const re = /```sql\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[1].trim();
    if (body) last = body;
  }
  return last;
}

export type LocateTarget = { schema?: string; table: string; column?: string };

/** The reply's final ```locate fence — {schema, table, column} JSON the
 *  visualizer highlights. Null when absent or unusable. */
export function lastLocateFence(text: string): LocateTarget | null {
  const re = /```locate\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[1].trim();
    if (body) last = body;
  }
  if (!last) return null;
  try {
    const raw = JSON.parse(last) as { schema?: unknown; table?: unknown; column?: unknown };
    if (typeof raw.table !== "string" || !raw.table.trim()) return null;
    return {
      table: raw.table.trim(),
      schema: typeof raw.schema === "string" && raw.schema.trim() ? raw.schema.trim() : undefined,
      column: typeof raw.column === "string" && raw.column.trim() ? raw.column.trim() : undefined,
    };
  } catch {
    return null;
  }
}
