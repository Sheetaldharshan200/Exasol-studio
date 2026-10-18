// Quoted SQL identifiers for statements Studio writes: always quoted (the
// catalog's exact spelling), with an embedded `"` doubled so a name can never
// end the identifier early.

/** `name` → `"name"`, with `"` doubled. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** `"SCHEMA"."NAME"`, or `"NAME"` without a schema. */
export function qualify(schema: string | undefined | null, name: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
}
