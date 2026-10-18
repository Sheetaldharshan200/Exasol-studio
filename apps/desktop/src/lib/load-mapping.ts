// Which file column fills each column of an existing table: by name
// (ignoring case, spaces and underscores), else nothing (NULL). Pure.

const norm = (s: string) => s.toUpperCase().replace(/[\s_"]/g, "");

export function defaultMapping(fileColumns: readonly string[], tableColumns: readonly string[]): (number | null)[] {
  const byName = new Map<string, number>();
  fileColumns.forEach((c, i) => {
    if (!byName.has(norm(c))) byName.set(norm(c), i);
  });
  return tableColumns.map((t) => byName.get(norm(t)) ?? null);
}

/** Every table column is filled from somewhere. */
export const mapsEverything = (mapping: readonly (number | null)[]) => mapping.every((m) => m !== null);
