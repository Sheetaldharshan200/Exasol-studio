// A SQL step on other boxes. The editor reads its sources as `derived_table`
// (or `source_1`, `source_2`, …); ⌘↵ runs; Esc goes back to the result.

import { memo, useContext, useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import Editor from "@monaco-editor/react";
import { ArrowLeft, FileCode2, Pencil, Play, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoxFrame } from "./BoxFrame.tsx";
import { EditorSetupContext, useCanvas, useCanvasStore, useZoom, LOD } from "./context.ts";
import { boxTitle, byId, compileSql, sourcePlaceholder, type QueryBox as QueryBoxModel } from "./model.ts";
import { RowsBody, rowActions } from "./TableBox.tsx";
import type { HaloAction } from "./Halo.tsx";

export const QueryBoxNode = memo(function QueryBoxNode({ id, selected }: NodeProps) {
  const box = useCanvas((s) => s.doc.boxes.find((b) => b.id === id)) as QueryBoxModel | undefined;
  const run = useCanvas((s) => s.runs[id]);
  const doc = useCanvas((s) => s.doc);
  const store = useCanvasStore();
  const zoom = useZoom();
  const setup = useContext(EditorSetupContext);
  // A step with no rows yet opens on its editor; one with rows opens on them.
  const [editing, setEditing] = useState(() => !run?.result);
  const showEditor = editing && zoom >= LOD.editor;
  const runNow = () => {
    setEditing(false);
    void store.getState().run(id);
  };
  const actions = useMemo<HaloAction[]>(() => {
    if (!box) return [];
    const base = rowActions(id, box.name, store, !!run?.result?.rows.length);
    const edit: HaloAction = editing
      ? { id: "back", label: "Back to the result", icon: ArrowLeft, side: "top", onClick: () => setEditing(false), disabled: !run?.result }
      : { id: "edit", label: "Edit the statement", icon: Pencil, side: "top", onClick: () => setEditing(true) };
    const openSql: HaloAction = {
      id: "open",
      label: "Open the compiled SQL in a query tab",
      icon: FileCode2,
      side: "top",
      disabled: !setup.openSql,
      onClick: () => {
        try {
          setup.openSql?.(compileSql(box, byId(doc)), box.name);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e));
        }
      },
    };
    return [edit, openSql, ...base];
  }, [box, id, store, run?.result, editing, doc, setup]);
  if (!box) return null;
  const sourceNames = box.sources.map((sid, i) => {
    const s = byId(doc).get(sid);
    return `${sourcePlaceholder(i, box.sources.length)} = ${s ? boxTitle(s) : "(gone)"}`;
  });
  return (
    <BoxFrame id={id} title={box.name} icon={SquareTerminal} accent="#a78bfa" selected={!!selected} actions={actions} run={run} idleText="Not run yet" onRename={(n) => store.getState().setName(id, n)}>
      {showEditor ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1 text-[10.5px] text-muted-foreground">
            <span className="truncate" title={sourceNames.join("\n")}>
              {sourceNames.join(" · ")}
            </span>
            <span className="ml-auto shrink-0">Press ⌘↵ (Ctrl+↵) to run</span>
            <button onClick={runNow} className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85">
              <Play className="h-3 w-3" /> Run
            </button>
          </div>
          <div className="min-h-0 flex-1" onKeyDownCapture={(e) => e.key === "Escape" && run?.result && setEditing(false)}>
            <Editor
              language="sql"
              value={box.sql}
              theme={setup.editorTheme}
              beforeMount={setup.beforeMount}
              onChange={(v) => store.getState().setSql(id, v ?? "")}
              onMount={(ed, m) => {
                ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => {
                  store.getState().setSql(id, ed.getValue());
                  runNow();
                });
              }}
              options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: "off", wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 8 }, folding: false, renderLineHighlight: "none" }}
            />
          </div>
        </div>
      ) : editing ? (
        <pre className={cn("flex-1 overflow-hidden whitespace-pre-wrap p-3 font-mono text-[10px] leading-snug text-muted-foreground")}>{box.sql}</pre>
      ) : (
        <RowsBody id={id} />
      )}
    </BoxFrame>
  );
});
