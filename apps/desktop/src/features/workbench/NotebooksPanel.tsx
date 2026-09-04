// The Notebooks rail panel: every saved notebook, most-recently-updated first,
// with New / open / delete. Self-contained — it reads the notebook store and
// opens a notebook via focusNotebook (which the Notebook tab listens for).

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, NotebookText } from "lucide-react";
import { addNotebookDoc, deleteNotebook, focusNotebook, listNotebooks } from "@/features/workbench/notebook-store";
import { cn } from "@/lib/utils";

type Meta = { id: string; title: string; updatedAt: number };

export function NotebooksPanel() {
  const [items, setItems] = useState<Meta[]>([]);

  const refresh = useCallback(() => {
    setItems(listNotebooks().sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("studio:notebooks-changed", refresh);
    return () => window.removeEventListener("studio:notebooks-changed", refresh);
  }, [refresh]);

  const onNew = () => {
    const n = listNotebooks().length + 1;
    const id = addNotebookDoc(`Notebook ${n}`, [{ type: "sql", src: "" }]);
    focusNotebook(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{items.length} notebooks</span>
        <button onClick={onNew} className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-secondary" title="New notebook">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {items.length === 0 ? (
          <div className="px-2 py-4 text-[11px] text-muted-foreground">No notebooks yet. Click New to start one.</div>
        ) : (
          items.map((nb) => (
            <div key={nb.id} className="group flex items-center gap-1 rounded-md px-1">
              <button onClick={() => focusNotebook(nb.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] text-foreground hover:bg-secondary")}>
                <NotebookText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{nb.title}</span>
              </button>
              <button onClick={() => deleteNotebook(nb.id)} className="rounded p-1 text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100" title="Delete notebook">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
