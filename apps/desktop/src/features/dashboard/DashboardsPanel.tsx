// The Dashboards rail panel: every saved dashboard, most-recently-opened first,
// with New / open / delete. Self-contained — it reads the list over ipc and opens
// a dashboard by dispatching the same `studio:open-dashboard` event the shell
// already handles, so it needs no props.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, LayoutGrid } from "lucide-react";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const RECENTS_KEY = "studio.dashboards.recent"; // { [id]: epochMs }

type Meta = { id: string; title: string };

function loadRecents(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function touchRecent(id: string) {
  const r = loadRecents();
  r[id] = Date.now();
  localStorage.setItem(RECENTS_KEY, JSON.stringify(r));
}

function openDashboard(id: string, title: string) {
  touchRecent(id);
  window.dispatchEvent(new CustomEvent("studio:open-dashboard", { detail: { id, title } }));
}

export function DashboardsPanel() {
  const [items, setItems] = useState<Meta[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await ipc.dashboardList();
      const recents = loadRecents();
      list.sort((a, b) => (recents[b.id] ?? 0) - (recents[a.id] ?? 0) || a.title.localeCompare(b.title));
      setItems(list);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    window.addEventListener("studio:dashboards-changed", on);
    return () => window.removeEventListener("studio:dashboards-changed", on);
  }, [refresh]);

  const onNew = () => {
    const id = `dash-${Date.now()}`;
    openDashboard(id, "New dashboard");
    setTimeout(() => void refresh(), 600); // the tab persists it shortly after
  };

  const onDelete = async (id: string) => {
    await ipc.dashboardDelete(id).catch(() => {});
    void refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{items?.length ?? 0} dashboards</span>
        <button onClick={onNew} className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-secondary" title="New dashboard">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {items === null ? (
          <div className="px-2 py-4 text-[11px] text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-4 text-[11px] text-muted-foreground">No dashboards yet. Click New, or ask the assistant to build one.</div>
        ) : (
          items.map((d) => (
            <div key={d.id} className="group flex items-center gap-1 rounded-md px-1">
              <button onClick={() => openDashboard(d.id, d.title)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] text-foreground hover:bg-secondary")}>
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
              </button>
              <button onClick={() => void onDelete(d.id)} className="rounded p-1 text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100" title="Delete dashboard">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
