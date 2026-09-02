// The notebook persistence keys and the one write path other features use to
// create a notebook (the chat's "Create notebook" card). Kept apart from the
// NotebookTab component so creating a notebook never requires mounting it.

export const NB_KEY = "studio.notebook.v1"; // legacy single-notebook key (migrated)
export const NBS_KEY = "studio.notebooks.v1"; // { id, title, cells, updatedAt }[]
export const NB_ACTIVE_KEY = "studio.notebooks.active";
/** Set to a notebook id to have the Notebook tab run all its cells once it
 *  loads that notebook (the chat's "Create notebook" card sets it). */
export const NB_PENDING_RUN_KEY = "studio.notebooks.pendingRun";

export type NotebookCellSeed = { type: "sql" | "markdown" | "mermaid"; src: string; chart?: string };

/** Append a notebook, make it active, and tell mounted notebook views to
 *  reload. Returns the new notebook's id. */
export function addNotebookDoc(title: string, cells: NotebookCellSeed[]): string {
  const id = `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let books: unknown[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(NBS_KEY) ?? "[]");
    if (Array.isArray(raw)) books = raw;
  } catch {
    /* corrupt store — start a fresh list rather than losing the new notebook */
  }
  books.push({ id, title, cells, updatedAt: Date.now() });
  localStorage.setItem(NBS_KEY, JSON.stringify(books));
  localStorage.setItem(NB_ACTIVE_KEY, id);
  localStorage.setItem(NB_PENDING_RUN_KEY, id);
  window.dispatchEvent(new Event("studio:notebooks-changed"));
  return id;
}
