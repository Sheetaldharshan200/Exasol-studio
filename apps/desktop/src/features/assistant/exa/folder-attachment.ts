// A whole picked folder becomes ONE composer attachment (a single chip with a
// folder icon), instead of a pile of per-file chips. The real File objects are
// kept in-memory here and written to disk when the message is sent; the
// synthetic File that assistant-ui holds carries only a small JSON manifest
// (folder name + per-file path/size), so nothing large rides in the composer.

export const FOLDER_MIME = "application/x-exasol-folder";

export type FolderEntry = { path: string; size: number };
export type FolderManifest = { groupId: string; folder: string; count: number; entries: FolderEntry[] };

type Group = { id: string; folder: string; files: File[] };
const groups = new Map<string, Group>();
let seq = 0;
// Bound the in-memory File[] retention: a composer "remove" can't tell us which
// group to drop (the adapter's remove() gets no id), so cap how many un-sent
// folder picks we hold and evict the oldest. Sent folders release themselves.
const MAX_GROUPS = 6;

const relPathOf = (f: File): string => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

/** The top-level folder name shared by a picked folder's files (webkitRelativePath
 *  is "<folder>/<sub>/<file>"). Falls back to the bare name. */
export function topFolderName(files: File[]): string {
  const rel = files.length ? relPathOf(files[0]) : "";
  return rel.split("/")[0] || "folder";
}

/** Register a picked folder's files and return a single synthetic File that
 *  stands in for the whole folder in the composer. */
export function makeFolderAttachment(files: File[]): File {
  const folder = topFolderName(files);
  const id = `fg${++seq}`;
  // Evict the oldest un-sent group(s) if we're over the cap (Map keeps insertion order).
  while (groups.size >= MAX_GROUPS) {
    const oldest = groups.keys().next().value;
    if (oldest === undefined) break;
    groups.delete(oldest);
  }
  groups.set(id, { id, folder, files });
  const manifest: FolderManifest = {
    groupId: id,
    folder,
    count: files.length,
    entries: files.map((f) => ({ path: relPathOf(f), size: f.size })),
  };
  return new File([JSON.stringify(manifest)], folder, { type: FOLDER_MIME });
}

export function isFolderAttachment(file?: File | null): boolean {
  return !!file && file.type === FOLDER_MIME;
}

/** Parse the manifest carried inside a synthetic folder File (async — reads text). */
export async function readFolderManifest(file: File): Promise<FolderManifest | null> {
  try {
    const m = JSON.parse(await file.text()) as FolderManifest;
    if (!m || !Array.isArray(m.entries)) return null;
    // Keep only well-formed entries so consumers can rely on `path` being a string.
    m.entries = m.entries.filter((e): e is FolderEntry => !!e && typeof e.path === "string");
    return m;
  } catch {
    return null;
  }
}

/** The real File objects for a group (empty once released). */
export function folderFiles(groupId: string): File[] {
  return groups.get(groupId)?.files ?? [];
}

/** Drop a group's in-memory files after they've been saved to disk. */
export function releaseFolder(groupId: string): void {
  groups.delete(groupId);
}
