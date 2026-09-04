// A workbench dashboard tab: loads the dashboard document from disk (via the
// Rust dashboard_* commands), renders the DashboardView bound to the active
// connection, and persists edits back (debounced so a drag doesn't write on
// every frame). The document survives shutdown and reopens identically.

import { useEffect, useRef, useState } from "react";
import { ipc } from "@/lib/ipc";
import { readNotebook, focusNotebook } from "@/features/workbench/notebook-store";
import { emptyDoc, type DashboardDoc } from "./model";
import { newFile, parse, serialize, type DashboardFile } from "./store";
import { DashboardView } from "./DashboardView";
import { dashboardBus, makeApply } from "./dashboard-bus";
import { clearCrossFilters } from "./cross-filter";
import { resetDrills } from "./drill-store";
import { dashboardDocFromCells } from "./notebook-to-dashboard";
import { exportDashboard, type ExportFormat } from "./export-dashboard";
import type { DashConn } from "./useWidgetData";

/** A synced (child) dashboard re-derives its CONTENT from its source notebook,
 *  while preserving the user's own layout + styling (dashboard-owned) so a synced
 *  dashboard stays hand-arrangeable. Content comes from the notebook; position
 *  and size stay with the dashboard. */
function deriveFromNotebook(doc: DashboardDoc): DashboardDoc {
  const src = doc.sourceNotebook;
  if (!src) return doc;
  const nb = readNotebook(src);
  if (!nb) return doc; // notebook deleted — keep the last synced content
  const fresh = dashboardDocFromCells(doc.id, nb.title || doc.title, nb.cells.map((c) => ({ type: c.type, src: c.src, chart: c.chart, viz: c.viz })), src);
  // Dashboard-owned props survive a sync (content — query, kind, text — comes from
  // the notebook; interaction/presentation is configured on the dashboard).
  const DASH_PROPS = ["title", "xField", "yFields", "crossFilter", "clickFilter", "drill", "measure", "color"];
  const byId = new Map(doc.widgets.map((w) => [w.id, w]));
  fresh.widgets = fresh.widgets.map((w) => {
    const prev = byId.get(w.id);
    if (!prev) return w;
    const kept: Record<string, unknown> = {};
    for (const k of DASH_PROPS) if (prev.props && k in prev.props) kept[k] = prev.props[k];
    return { ...w, layout: prev.layout, style: prev.style ?? w.style, props: { ...w.props, ...kept } };
  });
  return fresh;
}

const SAVE_DEBOUNCE_MS = 400;

export function DashboardTab({
  profileId,
  connectionName,
  dashboardId = "default",
}: {
  profileId: string | null;
  connectionName: string;
  dashboardId?: string;
}) {
  const [doc, setDoc] = useState<DashboardDoc | null>(null);
  const [refresh, setRefresh] = useState<DashboardFile["refresh"]>({ enabled: false, intervalSec: 30 });
  const fileRef = useRef<DashboardFile | null>(null);
  const docRef = useRef<DashboardDoc | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef<(d: DashboardDoc) => void>(() => {});
  docRef.current = doc;

  // Load once per dashboard id. Cross-filters are per-session, so clear on open.
  useEffect(() => {
    clearCrossFilters();
    resetDrills();
    let cancelled = false;
    (async () => {
      let file: DashboardFile;
      try {
        const raw = await ipc.dashboardRead(dashboardId);
        file = raw ? parse(raw) : newFile(emptyDoc(dashboardId, "Untitled dashboard"));
      } catch {
        file = newFile(emptyDoc(dashboardId, "Untitled dashboard"));
      }
      if (cancelled) return;
      const synced = deriveFromNotebook(file.doc); // one-way sync: notebook → dashboard
      fileRef.current = { ...file, doc: synced };
      setDoc(synced);
      setRefresh(file.refresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  // Live one-way sync: when the source notebook changes, re-derive this child.
  useEffect(() => {
    const resync = () => {
      const cur = fileRef.current?.doc;
      if (!cur?.sourceNotebook) return;
      const synced = deriveFromNotebook(cur);
      onChangeRef.current(synced);
    };
    window.addEventListener("studio:notebooks-changed", resync);
    return () => window.removeEventListener("studio:notebooks-changed", resync);
  }, []);

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        const f = fileRef.current;
        if (f) void ipc.dashboardWrite(dashboardId, serialize(f)).catch(() => {});
      }
    };
  }, [dashboardId]);

  const onChange = (next: DashboardDoc) => {
    setDoc(next);
    docRef.current = next;
    const base = fileRef.current ?? newFile(next);
    const updated: DashboardFile = { ...base, doc: next };
    fileRef.current = updated;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void ipc
        .dashboardWrite(dashboardId, serialize(updated))
        .then(() => window.dispatchEvent(new Event("studio:dashboards-changed"))) // refresh the Dashboards panel
        .catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  };
  onChangeRef.current = onChange;

  // Register with the bus so the assistant's dashboard.* actions apply ops to
  // THIS live document (the front tab) and get a real result back.
  useEffect(() => {
    const fallback = () => docRef.current ?? emptyDoc(dashboardId, "Untitled dashboard");
    return dashboardBus.register({
      id: dashboardId,
      apply: makeApply(fallback, (d) => onChangeRef.current(d)),
      getDoc: fallback,
    });
  }, [dashboardId]);

  if (!doc) {
    return <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">Loading dashboard…</div>;
  }

  const onRefreshChange = (next: DashboardFile["refresh"]) => {
    setRefresh(next);
    const base = fileRef.current ?? newFile(doc);
    const updated: DashboardFile = { ...base, refresh: next };
    fileRef.current = updated;
    void ipc.dashboardWrite(dashboardId, serialize(updated)).catch(() => {});
  };

  const conn: DashConn = profileId ? { profileId, connectionName } : null;
  const onExport = (format: ExportFormat) => void exportDashboard(doc, conn, format);
  const onEditSource = doc.sourceNotebook ? () => focusNotebook(doc.sourceNotebook!) : undefined;
  return (
    <DashboardView
      doc={doc}
      conn={conn}
      refreshConfig={refresh}
      onChange={onChange}
      onRefreshChange={onRefreshChange}
      onExport={onExport}
      onEditSource={onEditSource}
    />
  );
}
