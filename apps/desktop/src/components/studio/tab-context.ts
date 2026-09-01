// Describes the ACTIVE workbench tab as AI context — the chat's Copilot-style
// "current tab" pin resolves through this, so pinning a query tab, a notebook,
// the visualizer or any other dev tab hands the assistant what's actually on
// screen. Pure given its inputs; the notebook reader is injectable for tests.

import type { SqlTab } from "./tabs";

export type TabContext = {
  id: string;
  view: string;
  title: string;
  body: string;
  /** For writable targets (query tabs): the WORK-ON-THIS mandate, appended
   *  only while the pin's pencil (write mode) is on. */
  mandate?: string;
};

type NotebookDocLite = { id: string; title: string; cells: { type: string; src: string; chart?: string }[] };

/** The active notebook from localStorage (injectable for tests). */
export function readActiveNotebook(): NotebookDocLite | null {
  try {
    const books = JSON.parse(localStorage.getItem("studio.notebooks.v1") ?? "[]") as NotebookDocLite[];
    if (!Array.isArray(books) || books.length === 0) return null;
    const active = localStorage.getItem("studio.notebooks.active");
    return books.find((b) => b.id === active) ?? books[0];
  } catch {
    return null;
  }
}

const CELL_CAP = 30;
const SRC_CAP = 2_000;

export function describeTabForContext(
  tab: Pick<SqlTab, "id" | "view" | "title" | "sql" | "execError">,
  notebook: NotebookDocLite | null = null,
): TabContext {
  const base = { id: tab.id };
  switch (tab.view) {
    case "sql": {
      const err = tab.execError ? `\n\nLast error on this tab:\n${tab.execError}` : "";
      return {
        ...base,
        view: "sql",
        title: tab.title,
        body: `The user pinned the open query tab "${tab.title}". Current SQL:\n\n\`\`\`sql\n${tab.sql.trim() || "-- (empty)"}\n\`\`\`${err}`,
        mandate:
          "WORK ON THIS TAB DIRECTLY: write or fix the SQL (verify with your database tools when you can) and finish with the final SQL in a ```sql code block — the app writes that block INTO this query tab. Do the job; don't just describe it.",
      };
    }
    case "notebook": {
      if (!notebook) return { ...base, view: "notebook", title: tab.title, body: `The Notebook tab is open (no notebook content available).` };
      const cells = notebook.cells.slice(0, CELL_CAP).map((c, i) => {
        const src = c.src.length > SRC_CAP ? `${c.src.slice(0, SRC_CAP)}\n…(truncated)` : c.src;
        const chart = c.chart ? `, chart: ${c.chart}` : "";
        return `Cell ${i + 1} (${c.type}${chart}):\n${src.trim() || "(empty)"}`;
      });
      const more = notebook.cells.length > CELL_CAP ? `\n…and ${notebook.cells.length - CELL_CAP} more cells.` : "";
      return {
        ...base,
        view: "notebook",
        title: notebook.title,
        body:
          `Notebook "${notebook.title}" — cells are numbered; refer to them by number to manipulate them ` +
          `(pin a cell in the notebook to apply SQL back into it):\n\n${cells.join("\n\n")}${more}`,
      };
    }
    case "visualizer":
      return { ...base, view: "visualizer", title: tab.title, body: `The Schema Visualizer tab "${tab.title}" is open — the user is looking at the schema diagram.` };
    case "object":
      return { ...base, view: "object", title: tab.title, body: `The database object tab "${tab.title}" is open — the user is inspecting this object.` };
    case "git":
      return { ...base, view: "git", title: tab.title, body: `The Source Control tab is open — the user is working with the workspace git repository.` };
    default:
      return { ...base, view: tab.view, title: tab.title, body: `The "${tab.title}" tab (${tab.view}) is open.` };
  }
}
