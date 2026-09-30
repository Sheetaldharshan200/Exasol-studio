// The store reaches the nodes through context: ReactFlow renders node
// components itself, so they cannot take props from the canvas.

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { useStore as useFlowStore } from "@xyflow/react";
import type { CanvasState, CanvasStore } from "./store.ts";

export const CanvasStoreContext = createContext<CanvasStore | null>(null);

export function useCanvas<T>(selector: (s: CanvasState) => T): T {
  const store = useContext(CanvasStoreContext);
  if (!store) throw new Error("useCanvas outside a canvas");
  return useStore(store, selector);
}

export function useCanvasStore(): CanvasStore {
  const store = useContext(CanvasStoreContext);
  if (!store) throw new Error("useCanvasStore outside a canvas");
  return store;
}

/** The canvas zoom, for level of detail: editors step aside when too small to type in. */
export function useZoom(): number {
  return useFlowStore((s) => s.transform[2]);
}

/** Below this the type row and grids thin out; below EDITOR the editors hide. */
export const LOD = { detail: 0.55, editor: 0.4, title: 0.28 };

/** Shared by the box components so Monaco is themed like the rest of Studio. */
export type EditorSetup = {
  beforeMount?: (m: import("@monaco-editor/react").Monaco) => void;
  editorTheme?: string;
  /** Opens a statement in a query tab of the workbench. */
  openSql?: (sql: string, title?: string) => void;
};
export const EditorSetupContext = createContext<EditorSetup>({});
