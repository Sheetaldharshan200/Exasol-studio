import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { iconFor, type TreeNode } from "@/features/workbench/tree-model";
import { expandedChildren } from "./tree-folders";
import { treeKey, type FlatRow } from "./tree-keys";
import { rowWindow } from "@/lib/grid-view";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Self-contained database navigator.
 *
 * Rows lazily load their children on expand (cached per tree instance, so
 * re-expanding is instant). Nesting is drawn with curved elbow connectors that
 * link each child to its parent, and long object names scroll horizontally
 * instead of truncating.
 */

const INDENT = 16; // px per nesting level
const ROW_H = 24; // px row height
const MID = ROW_H / 2;
const CENTER = 8; // x of the vertical trunk within an indent cell
const LINE = "var(--border)";

type NodeState = { status: "loading" | "done" | "error"; children: TreeNode[]; error?: string };

export function DatabaseTree({
  roots,
  onOpenObject,
  onOpenSource,
  onOpenDetails,
  onContext,
  initialExpandedItems,
  collapseSignal,
  refreshSignal,
}: {
  roots: TreeNode[];
  onOpenObject: (schema: string, name: string) => void;
  /** A stored script or function: open its source in an editor tab. */
  onOpenSource?: (kind: "script" | "function", schema: string, name: string) => void;
  /** Double-click a schema/table/view → open its detail tab. */
  onOpenDetails?: (node: TreeNode) => void;
  /** Right-click on a node → open the context menu at (x, y). */
  onContext?: (node: TreeNode, x: number, y: number) => void;
  /** Node ids expanded on first render (default: none). */
  initialExpandedItems?: string[];
  /** Increment to collapse every expanded node in this tree. */
  collapseSignal?: number;
  /** Increment to refresh in place (cache-clear + stale-while-revalidate
   *  reload of the expanded nodes) — WITHOUT remounting, so the tree never
   *  flashes back to skeletons on refresh/reconnect. */
  refreshSignal?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpandedItems ?? []));
  const [states, setStates] = useState<Record<string, NodeState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const cache = useRef<Map<string, TreeNode[]>>(new Map());
  const firstCollapse = useRef(true);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  /** `cascade`: after a refresh, load the fresh children that are expanded too. */
  const load = useCallback((node: TreeNode, cascade = false) => {
    const cached = cache.current.get(node.id);
    if (cached) {
      setStates((s) => ({ ...s, [node.id]: { status: "done", children: cached } }));
      return;
    }
    if (!node.load) {
      setStates((s) => ({ ...s, [node.id]: { status: "done", children: [] } }));
      return;
    }
    // Stale-while-revalidate: keep the previous children on screen while the
    // reload runs — clearing them collapsed the tree to a skeleton and back,
    // which read as a flicker on every refresh.
    setStates((s) => ({ ...s, [node.id]: { status: "loading", children: s[node.id]?.children ?? [] } }));
    node
      .load()
      .then((children) => {
        cache.current.set(node.id, children);
        setStates((s) => ({ ...s, [node.id]: { status: "done", children } }));
        if (cascade) for (const child of expandedChildren(children, expandedRef.current)) load(child, true);
      })
      .catch((err) =>
        setStates((s) => ({
          ...s,
          [node.id]: { status: "error", children: [], error: errorMessage(err) },
        })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load any nodes that are expanded on first mount (e.g. the Schemas folder).
  useEffect(() => {
    roots.forEach((r) => {
      if (expanded.has(r.id)) load(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);

  // Collapse everything when the signal changes.
  useEffect(() => {
    if (firstCollapse.current) {
      firstCollapse.current = false;
      return;
    }
    setExpanded(new Set());
  }, [collapseSignal]);

  // Cache-clearing, stale-while-revalidate reload of every expanded node — the
  // in-place refresh used by both the catalog-changed event and refreshSignal.
  // Keeps current children on screen (load() is SWR) so nothing flashes.
  // Top-down from the roots: each expanded folder reloads from its FRESH
  // parent's children, so a dropped object is not reloaded and a renamed
  // one is not looked up under its old node.
  const reloadExpanded = useCallback(() => {
    cache.current.clear();
    for (const root of expandedChildren(roots, expandedRef.current)) load(root, true);
  }, [roots, load]);

  // Stay live: when the catalog changes (a CREATE/DROP/import ran), refresh.
  useEffect(() => {
    window.addEventListener("studio:catalog-changed", reloadExpanded);
    return () => window.removeEventListener("studio:catalog-changed", reloadExpanded);
  }, [reloadExpanded]);

  // A refresh/reconnect bumps refreshSignal — reload IN PLACE instead of
  // remounting the tree (the old `key={treeKey}` remount reset every node to a
  // skeleton, which read as a flicker on every refresh/open).
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    reloadExpanded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const toggle = useCallback(
    (node: TreeNode) => {
      if (!node.expandable) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
          const st = states[node.id];
          if (!st || st.status === "error") load(node);
        }
        return next;
      });
    },
    [states, load],
  );

  // The rows as shown, flattened in display order: only those in view of the
  // sidebar's scroller are rendered, and the keyboard moves over them.
  type Flat =
    | { kind: "row"; node: TreeNode; trail: boolean[]; isLast: boolean; open: boolean }
    | { kind: "placeholder"; key: string; trail: boolean[]; state: "loading" | "error"; text?: string };
  const flat: Flat[] = [];
  const walk = (nodes: TreeNode[], trail: boolean[]) => {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const open = expanded.has(node.id);
      const st = states[node.id];
      flat.push({ kind: "row", node, trail, isLast, open });
      if (open && st) {
        const childTrail = [...trail, !isLast];
        if (st.status === "loading" && st.children.length === 0) flat.push({ kind: "placeholder", key: node.id + ":l", trail: childTrail, state: "loading" });
        else if (st.status === "error") flat.push({ kind: "placeholder", key: node.id + ":e", trail: childTrail, state: "error", text: st.error });
        // Refreshing with existing data keeps it visible: no skeleton swap.
        else walk(st.children, childTrail);
      }
    });
  };
  walk(roots, []);
  const nodeRows = flat.flatMap((f, at) => (f.kind === "row" ? [{ at, f }] : []));
  const keyRows: FlatRow[] = nodeRows.map(({ f }) => ({ id: f.node.id, depth: f.trail.length, expandable: !!f.node.expandable, open: f.open }));

  const sourceOf = (node: TreeNode) => {
    const c = node.ctx;
    return onOpenSource && c && (c.type === "script" || c.type === "function") && c.schema && c.name
      ? { kind: c.type as "script" | "function", schema: c.schema, name: c.name }
      : null;
  };
  const hasDetails = (node: TreeNode) => {
    const c = node.ctx;
    return !!onOpenDetails && !!c && (c.type === "schema" || c.type === "virtual-schema" || c.type === "table" || c.type === "view" || c.type === "user");
  };
  // Single tap / Enter: show info — the detail tab if the node has one; else
  // run the object, else expand.
  const openNode = (node: TreeNode) => {
    setSelected(node.id);
    const source = sourceOf(node);
    if (source) onOpenSource!(source.kind, source.schema, source.name);
    else if (hasDetails(node)) onOpenDetails!(node);
    else if (node.selectable) onOpenObject(node.selectable.schema, node.selectable.name);
    else if (node.expandable) toggle(node);
  };
  // Double tap: expand/collapse the branch.
  const expandNode = (node: TreeNode) => {
    setSelected(node.id);
    const source = sourceOf(node);
    if (node.expandable) toggle(node);
    else if (source) onOpenSource!(source.kind, source.schema, source.name);
    else if (node.selectable) onOpenObject(node.selectable.schema, node.selectable.name);
  };

  // The window of rows in view of the nearest scrolling ancestor.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  const scrollerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    let scroller = el?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!el || !scroller) return;
    const sc = scroller;
    scrollerRef.current = sc;
    const measure = () => {
      const top = sc.scrollTop - (el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop);
      setView((v) => (v.top === top && v.height === sc.clientHeight ? v : { top, height: sc.clientHeight }));
    };
    measure();
    sc.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(sc);
    return () => {
      sc.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);
  const win = rowWindow(view.top, view.height, ROW_H, flat.length, 30);

  const selectedAt = nodeRows.findIndex(({ f }) => f.node.id === selected);
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys on the tree itself; a focused chevron button keeps its own Enter.
    if (e.target !== e.currentTarget) return;
    const action = treeKey(keyRows, selectedAt, e.key, e.shiftKey);
    if (!action) return;
    e.preventDefault();
    const target = nodeRows[action.index]?.f;
    if (!target || target.kind !== "row") return;
    const node = target.node;
    if (action.kind === "select") {
      setSelected(node.id);
      // Keep the selected row in view (it may not be rendered yet).
      const sc = scrollerRef.current;
      const rowTop = nodeRows[action.index].at * ROW_H;
      if (sc && rowTop < view.top) sc.scrollTop -= view.top - rowTop;
      else if (sc && rowTop + ROW_H > view.top + view.height) sc.scrollTop += rowTop + ROW_H - (view.top + view.height);
    } else if (action.kind === "toggle") toggle(node);
    else if (action.kind === "open") openNode(node);
    else if (action.kind === "menu" && node.ctx) {
      const r = rootRef.current?.querySelector(`[data-tree-row="${CSS.escape(node.id)}"]`)?.getBoundingClientRect();
      onContext?.(node, r ? r.left + 24 : 0, r ? r.bottom : 0);
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="tree"
      onKeyDown={onKeyDown}
      className="overflow-x-auto overflow-y-hidden py-0.5 outline-none [scrollbar-width:none] focus-visible:ring-1 focus-visible:ring-primary/40 [&::-webkit-scrollbar]:hidden"
    >
      <div className="w-max min-w-full">
        {win.top ? <div style={{ height: win.top }} /> : null}
        {flat.slice(win.start, win.end).map((f) =>
          f.kind === "placeholder" ? (
            <Placeholder key={f.key} trail={f.trail} kind={f.state} text={f.text} />
          ) : (
            <Row
              key={f.node.id}
              node={f.node}
              trail={f.trail}
              isLast={f.isLast}
              open={f.open}
              selected={selected === f.node.id}
              // The chevron alone toggles the branch.
              onToggle={() => {
                setSelected(f.node.id);
                toggle(f.node);
              }}
              onOpen={() => openNode(f.node)}
              onExpand={() => expandNode(f.node)}
              onContext={
                f.node.ctx
                  ? (x, y) => {
                      setSelected(f.node.id);
                      onContext?.(f.node, x, y);
                    }
                  : undefined
              }
            />
          ),
        )}
        {win.bottom ? <div style={{ height: win.bottom }} /> : null}
      </div>
    </div>
  );
}

/** Vertical trunk + curved elbow connectors for one row's indentation. */
function Guides({ trail, isLast }: { trail: boolean[]; isLast: boolean }) {
  return (
    <>
      {trail.map((cont, i) => (
        <span key={i} className="relative inline-block shrink-0" style={{ width: INDENT, height: ROW_H }}>
          {cont ? (
            <span
              className="absolute"
              style={{ left: CENTER, top: 0, width: 1, height: ROW_H, background: LINE }}
            />
          ) : null}
        </span>
      ))}
      {/* Connector cell for this node: curved elbow from the parent trunk. */}
      <span className="relative inline-block shrink-0" style={{ width: INDENT, height: ROW_H }}>
        {/* curved elbow: trunk down to middle, then a rounded turn to the child */}
        <span
          className="absolute"
          style={{
            left: CENTER,
            top: 0,
            width: INDENT - CENTER,
            height: MID,
            borderLeft: `1px solid ${LINE}`,
            borderBottom: `1px solid ${LINE}`,
            borderBottomLeftRadius: 8,
          }}
        />
        {/* continue the trunk down to the next sibling */}
        {!isLast ? (
          <span
            className="absolute"
            style={{ left: CENTER, top: MID, width: 1, height: MID, background: LINE }}
          />
        ) : null}
      </span>
    </>
  );
}

function accentFor(kind: TreeNode["kind"]): string {
  if (kind === "server" || kind === "schema") return "text-primary";
  if (kind === "virtual-schema") return "text-teal";
  if (kind === "column-pk" || kind === "constraint-pk") return "text-warning";
  if (kind === "constraint-fk") return "text-info";
  if (kind.startsWith("script")) return "text-syntax-function";
  return "";
}

function Row({
  node,
  trail,
  isLast,
  open,
  selected,
  onToggle,
  onOpen,
  onExpand,
  onContext,
}: {
  node: TreeNode;
  trail: boolean[];
  isLast: boolean;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onExpand: () => void;
  onContext?: (x: number, y: number) => void;
}) {
  const Icon = iconFor(node.kind);
  // Hover tooltip: friendly type + full name + any inline meta.
  const kindLabel = node.kind.replace(/-/g, " ");
  const tip = [kindLabel, node.label, node.meta].filter(Boolean).join(" · ");
  // Single tap shows info (instant); a second tap within 300ms opens the
  // dropdown (expand/collapse). Detection is timestamp-based rather than the
  // browser's dblclick — that fires only when both clicks land on the very same
  // element, which re-renders here can break. The double tap also re-runs the
  // single (info) action, which is harmless.
  const lastClickAt = useRef(0);
  const handleClick = () => {
    const now = Date.now();
    if (now - lastClickAt.current < 300) {
      lastClickAt.current = 0;
      onExpand();
    } else {
      lastClickAt.current = now;
      onOpen();
    }
  };
  return (
    <div
      onClick={handleClick}
      title={tip}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={node.expandable ? open : undefined}
      data-tree-row={node.id}
      onContextMenu={
        onContext
          ? (e) => {
              e.preventDefault();
              onContext(e.clientX, e.clientY);
            }
          : undefined
      }
      style={{ height: ROW_H }}
      className={cn(
        "flex min-w-full items-center whitespace-nowrap pr-3 text-[13px] transition-colors",
        selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        node.selectable || node.ctx || node.expandable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <Guides trail={trail} isLast={isLast} />
      <button
        type="button"
        aria-label={open ? "Collapse" : "Expand"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex w-4 shrink-0 items-center justify-center"
      >
        {node.expandable ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform hover:text-foreground", open && "rotate-90")}
          />
        ) : null}
      </button>
      <Icon className={cn("mr-1.5 h-3.5 w-3.5 shrink-0", accentFor(node.kind))} />
      <span className="shrink-0">{node.label}</span>
      {node.meta ? (
        <span className="ml-1.5 shrink-0 font-mono text-[11px] text-syntax-type/80">{node.meta}</span>
      ) : null}
      {node.badge ? (
        <span className="ml-1.5 shrink-0 rounded-full bg-secondary px-1.5 py-px font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
          {node.badge}
        </span>
      ) : null}
    </div>
  );
}

function Placeholder({
  trail,
  kind,
  text,
}: {
  trail: boolean[];
  kind: "loading" | "error";
  text?: string;
}) {
  return (
    <div
      className="flex items-center whitespace-nowrap text-[11px]"
      style={{ height: ROW_H, paddingLeft: (trail.length + 1) * INDENT + 4 }}
    >
      {kind === "loading" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </span>
      ) : (
        <span className="text-destructive">{text ?? "Failed to load."}</span>
      )}
    </div>
  );
}
