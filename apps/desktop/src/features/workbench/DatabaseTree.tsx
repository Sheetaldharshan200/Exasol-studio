import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { iconFor, type TreeNode } from "@/features/workbench/tree-model";
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
  onContext,
  initialExpandedItems,
  collapseSignal,
}: {
  roots: TreeNode[];
  onOpenObject: (schema: string, name: string) => void;
  /** Right-click on a node → open the context menu at (x, y). */
  onContext?: (node: TreeNode, x: number, y: number) => void;
  /** Node ids expanded on first render (default: none). */
  initialExpandedItems?: string[];
  /** Increment to collapse every expanded node in this tree. */
  collapseSignal?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpandedItems ?? []));
  const [states, setStates] = useState<Record<string, NodeState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const cache = useRef<Map<string, TreeNode[]>>(new Map());
  const firstCollapse = useRef(true);

  const load = useCallback((node: TreeNode) => {
    const cached = cache.current.get(node.id);
    if (cached) {
      setStates((s) => ({ ...s, [node.id]: { status: "done", children: cached } }));
      return;
    }
    if (!node.load) {
      setStates((s) => ({ ...s, [node.id]: { status: "done", children: [] } }));
      return;
    }
    setStates((s) => ({ ...s, [node.id]: { status: "loading", children: [] } }));
    node
      .load()
      .then((children) => {
        cache.current.set(node.id, children);
        setStates((s) => ({ ...s, [node.id]: { status: "done", children } }));
      })
      .catch((err) =>
        setStates((s) => ({
          ...s,
          [node.id]: { status: "error", children: [], error: errorMessage(err) },
        })),
      );
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

  const rows: React.ReactNode[] = [];
  const walk = (nodes: TreeNode[], trail: boolean[]) => {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const open = expanded.has(node.id);
      const st = states[node.id];
      rows.push(
        <Row
          key={node.id}
          node={node}
          trail={trail}
          isLast={isLast}
          open={open}
          selected={selected === node.id}
          onToggle={() => {
            setSelected(node.id);
            toggle(node);
          }}
          onOpen={() =>
            node.selectable && onOpenObject(node.selectable.schema, node.selectable.name)
          }
          onContext={
            node.ctx
              ? (x, y) => {
                  setSelected(node.id);
                  onContext?.(node, x, y);
                }
              : undefined
          }
        />,
      );
      if (open && st) {
        const childTrail = [...trail, !isLast];
        if (st.status === "loading") {
          rows.push(<Placeholder key={node.id + ":l"} trail={childTrail} kind="loading" />);
        } else if (st.status === "error") {
          rows.push(
            <Placeholder key={node.id + ":e"} trail={childTrail} kind="error" text={st.error} />,
          );
        } else {
          walk(st.children, childTrail);
        }
      }
    });
  };
  walk(roots, []);

  return (
    <div className="overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="w-max min-w-full">{rows}</div>
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
  onContext,
}: {
  node: TreeNode;
  trail: boolean[];
  isLast: boolean;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onContext?: (x: number, y: number) => void;
}) {
  const Icon = iconFor(node.kind);
  return (
    <div
      onClick={onToggle}
      onDoubleClick={onOpen}
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
        node.selectable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <Guides trail={trail} isLast={isLast} />
      <span className="flex w-4 shrink-0 items-center justify-center">
        {node.expandable ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
          />
        ) : null}
      </span>
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
