import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { File, Folder, Tree, useTree } from "@/components/ui/file-tree";
import { iconFor, type TreeNode } from "@/features/workbench/tree-model";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Database navigator built on MagicUI's file-tree (Tree / Folder / File),
 * extended to lazily load each level from the backend on expand while keeping
 * per-object icons, type metadata, and count/state badges.
 */
export function DatabaseTree({
  roots,
  onOpenObject,
  initialExpandedItems,
}: {
  roots: TreeNode[];
  onOpenObject: (schema: string, name: string) => void;
  /** Node ids expanded on first render (default: none). */
  initialExpandedItems?: string[];
}) {
  return (
    <Tree
      className="h-full"
      indicator
      initialExpandedItems={initialExpandedItems ?? []}
      openIcon={<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
      closeIcon={<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
    >
      {roots.map((node) => (
        <LazyFolder key={node.id} node={node} onOpenObject={onOpenObject} />
      ))}
    </Tree>
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 py-px font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="truncate font-mono text-[11px] text-syntax-type/80">{children}</span>;
}

/** Content shown inside a folder trigger (icon + label + meta + badge). */
function folderLabel(node: TreeNode) {
  const Icon = iconFor(node.kind);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", accentFor(node.kind))} />
      <span className="truncate">{node.label}</span>
      {node.meta ? <Meta>{node.meta}</Meta> : null}
      {node.badge ? <Badge>{node.badge}</Badge> : null}
    </span>
  );
}

type LoadState = {
  status: "idle" | "loading" | "done" | "error";
  children: TreeNode[];
  error?: string;
};

function LazyFolder({
  node,
  onOpenObject,
}: {
  node: TreeNode;
  onOpenObject: (schema: string, name: string) => void;
}) {
  const { expandedItems } = useTree();
  const open = Boolean(expandedItems?.includes(node.id));
  const [state, setState] = useState<LoadState>({ status: "idle", children: [] });

  useEffect(() => {
    if (!open || state.status !== "idle") return;
    if (!node.load) {
      setState({ status: "done", children: [] });
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));
    node
      .load()
      .then((children) => setState({ status: "done", children }))
      .catch((err) => setState({ status: "error", children: [], error: errorMessage(err) }));
  }, [open, state.status, node]);

  return (
    <Folder
      value={node.id}
      element={folderLabel(node) as unknown as string}
      className="min-h-[26px] w-full pr-1 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      onDoubleClick={
        node.selectable
          ? () => onOpenObject(node.selectable!.schema, node.selectable!.name)
          : undefined
      }
    >
      {state.status === "loading" ? (
        <div className="flex items-center gap-1.5 py-1 pl-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="py-1 pl-1 text-[11px] text-destructive">{state.error}</div>
      ) : null}
      {state.children.map((child) =>
        child.expandable ? (
          <LazyFolder key={child.id} node={child} onOpenObject={onOpenObject} />
        ) : (
          <LeafNode key={child.id} node={child} onOpenObject={onOpenObject} />
        ),
      )}
    </Folder>
  );
}

function LeafNode({
  node,
  onOpenObject,
}: {
  node: TreeNode;
  onOpenObject: (schema: string, name: string) => void;
}) {
  const Icon = iconFor(node.kind);
  return (
    <File
      value={node.id}
      fileIcon={<Icon className={cn("h-3.5 w-3.5 shrink-0", accentFor(node.kind))} />}
      className="min-h-[24px] w-full pr-1 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      onDoubleClick={
        node.selectable
          ? () => onOpenObject(node.selectable!.schema, node.selectable!.name)
          : undefined
      }
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate">{node.label}</span>
        {node.meta ? <Meta>{node.meta}</Meta> : null}
        {node.badge ? <Badge>{node.badge}</Badge> : null}
      </span>
    </File>
  );
}
