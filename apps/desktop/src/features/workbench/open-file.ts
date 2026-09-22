/**
 * Where a file from the tree opens. A 300 MB CSV read whole into a text
 * editor is the one thing that used to freeze the app, so the decision is
 * made here, from the name and size, before a single byte is read.
 */
export const TABULAR_EXT = new Set(["csv", "tsv", "parquet"]);
export const TEXT_EXT = new Set(["sql", "txt", "md", "json", "yaml", "yml", "toml", "py", "js", "ts", "sh", "csv", "tsv", "xml", "ini", "cfg", "conf", "log", "r", "go", "cs", "rs", "html", "css"]);

/** Tabular files above this open as a paged grid, not as text. */
export const TEXT_LIMIT_TABULAR = 1 * 1024 * 1024;
/** No file above this opens as text at all. */
export const TEXT_LIMIT_ANY = 2 * 1024 * 1024;

export type OpenRoute =
  | { kind: "text" }
  | { kind: "preview"; editable: boolean }
  | { kind: "refuse"; reason: string };

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function routeOpen(file: { name: string; size: number | null | undefined }): OpenRoute {
  const ext = extOf(file.name);
  const size = file.size ?? 0;
  const tabular = TABULAR_EXT.has(ext);
  if (tabular) {
    // Parquet is never text; CSV/TSV are text only while small.
    if (ext === "parquet") return { kind: "preview", editable: false };
    return size > TEXT_LIMIT_TABULAR ? { kind: "preview", editable: true } : { kind: "text" };
  }
  if (!TEXT_EXT.has(ext)) return { kind: "refuse", reason: `Studio does not open .${ext || "?"} files.` };
  if (size > TEXT_LIMIT_ANY) return { kind: "refuse", reason: `${file.name} is ${formatBytes(size)} — too large to open as text.` };
  return { kind: "text" };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Page arithmetic for the grid: 1-based page, clamped. */
export function pageWindow(page: number, pageSize: number, total: number | null): { offset: number; limit: number; page: number; pages: number | null } {
  const pages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.max(1, pages === null ? page : Math.min(page, pages));
  return { offset: (clamped - 1) * pageSize, limit: pageSize, page: clamped, pages };
}
