// Decides how a composer attachment travels to the engine — pure and tested.
//
// The stock adapter inlines EVERY file as a base64 data URL inside the
// message. For data files that's a trap: ten CSVs become megabytes of prompt,
// the composer hangs, and the model gets truncated text it can't load anyway.
// Data files (and oversized text) are saved to disk instead, and the message
// carries a short note with the path — the agent loads from the path with its
// own tools (fs, exapump).

const DATA_EXTS = new Set(["csv", "tsv", "parquet", "xlsx", "xls", "jsonl", "ndjson"]);

/** Anything bigger inlines badly even when it's genuine prose/code. */
export const INLINE_LIMIT_BYTES = 512 * 1024;

export function fileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

/** "disk" → save + path note; "inline" → the stock data-URL behavior. */
export function routeAttachment(name: string, size: number): "disk" | "inline" {
  if (DATA_EXTS.has(fileExt(name))) return "disk";
  return size > INLINE_LIMIT_BYTES ? "disk" : "inline";
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
}

/** The text part sent in place of the file body. `firstLines` (for text-like
 *  data) gives the model the header/shape without the payload. */
export function buildDataFileNote(path: string, name: string, size: number, firstLines?: string[]): string {
  const preview = firstLines?.length
    ? `\nFirst lines:\n${firstLines
        .slice(0, 3)
        .map((l) => (l.length > 200 ? `${l.slice(0, 200)}…` : l))
        .join("\n")}`
    : "";
  return (
    `Attached data file "${name}" (${fmtBytes(size)}) saved to: ${path}\n` +
    `The contents are NOT inlined — read or load the file from that path (for tables: exapump upload / IMPORT).${preview}`
  );
}
