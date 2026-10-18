// Keyboard navigation in the database tree, over its rows as shown (a flat
// list in display order). Pure: it says what a key does; the tree does it.

export type FlatRow = { id: string; depth: number; expandable: boolean; open: boolean };

export type TreeKeyAction =
  | { kind: "select"; index: number }
  | { kind: "toggle"; index: number }
  | { kind: "open"; index: number }
  | { kind: "menu"; index: number }
  | null;

/** What `key` does with row `at` selected (-1: none yet). */
export function treeKey(rows: readonly FlatRow[], at: number, key: string, shift = false): TreeKeyAction {
  if (!rows.length) return null;
  if (at < 0 || at >= rows.length) return ["ArrowDown", "ArrowUp", "Home", "End"].includes(key) ? { kind: "select", index: key === "End" || key === "ArrowUp" ? rows.length - 1 : 0 } : null;
  const row = rows[at];
  switch (key) {
    case "ArrowDown":
      return { kind: "select", index: Math.min(rows.length - 1, at + 1) };
    case "ArrowUp":
      return { kind: "select", index: Math.max(0, at - 1) };
    case "Home":
      return { kind: "select", index: 0 };
    case "End":
      return { kind: "select", index: rows.length - 1 };
    case "ArrowRight":
      if (!row.expandable) return null;
      if (!row.open) return { kind: "toggle", index: at };
      // Open: step to the first child, when it is shown.
      return rows[at + 1]?.depth === row.depth + 1 ? { kind: "select", index: at + 1 } : null;
    case "ArrowLeft": {
      if (row.expandable && row.open) return { kind: "toggle", index: at };
      for (let i = at - 1; i >= 0; i--) if (rows[i].depth < row.depth) return { kind: "select", index: i };
      return null;
    }
    case "Enter":
      return { kind: "open", index: at };
    case "ContextMenu":
      return { kind: "menu", index: at };
    case "F10":
      return shift ? { kind: "menu", index: at } : null;
    default:
      return null;
  }
}
