/**
 * Query Performance — the execution-plan view, rendered as an interactive
 * React Flow graph. Each operator is a node (cost ring + badge + evidence);
 * edges are the execution SEQUENCE (by PART_ID — Exasol's profile views expose
 * no parent/child DAG, so we never fabricate one), labeled with the rows that
 * flow across them. The right rail carries the selected operator's evidence,
 * the warnings summary, the profile overview, the time-by-category bar and the
 * legend.
 *
 * "Evidence-based": every number cites the profile column it came from, the
 * derived operator type names the raw PART_NAME it was classified from, and
 * anything not measured reads "not measured" — never a fabricated zero.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position,
  MarkerType, useReactFlow, type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, Copy, Check, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan, PlanNode } from "@/lib/plan-model";
import {
  OPERATOR_BADGE, OPERATOR_COLOR, OPERATOR_TYPE_LABEL, HOT_COLOR, WARNING_LABEL, LEGEND_ORDER,
  fmtMs, fmtRows, fmtPct, fmtMiB, fmtCpuPct,
  planCategoryBreakdown, planClusterSize, planLacksDetailMetrics, hottestNodeId, sortedWarningItems,
  scannedSelectivity, durationShareLabel, planSourceLabel, buildPlanText,
} from "@/lib/plan-format";

const NODE_W = 150;
const NODE_GAP = 56;

type OperatorNodeData = { node: PlanNode; isHot: boolean; picked: boolean };

export function QueryPlanView({ plan, onOpenSql }: { plan: Plan; onOpenSql?: (sql: string, title?: string) => void }) {
  return (
    <ReactFlowProvider>
      <PlanInner plan={plan} onOpenSql={onOpenSql} />
    </ReactFlowProvider>
  );
}

function PlanInner({ plan, onOpenSql }: { plan: Plan; onOpenSql?: (sql: string, title?: string) => void }) {
  void onOpenSql;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const rf = useReactFlow();
  const hotId = hottestNodeId(plan);

  // A new plan invalidates the selection.
  useEffect(() => setSelectedId(null), [plan]);

  const nodes: Node<OperatorNodeData>[] = useMemo(
    () =>
      plan.nodes.map((node, i) => ({
        id: node.id,
        type: "operator",
        position: { x: i * (NODE_W + NODE_GAP), y: 0 },
        data: { node, isHot: node.id === hotId, picked: node.id === selectedId },
        draggable: false,
      })),
    [plan, hotId, selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      plan.nodes.slice(1).map((node, i) => {
        const prev = plan.nodes[i];
        return {
          id: `${prev.id}->${node.id}`,
          source: prev.id,
          target: node.id,
          label: prev.rowsOut !== undefined ? `${fmtRows(prev.rowsOut)} row${prev.rowsOut === 1 ? "" : "s"}` : undefined,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
          style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
          labelStyle: { fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" },
          labelBgStyle: { fill: "var(--panel)", fillOpacity: 0.85 },
        } satisfies Edge;
      }),
    [plan],
  );

  const jumpTo = useCallback(
    (id: string) => {
      setSelectedId(id);
      const n = nodes.find((x) => x.id === id);
      if (n) rf.setCenter(n.position.x + NODE_W / 2, n.position.y + 40, { zoom: 1.1, duration: 400 });
    },
    [nodes, rf],
  );

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildPlanText(plan));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const selected = selectedId ? plan.nodes.find((n) => n.id === selectedId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {plan.queryText ? (
          <button onClick={() => setShowSql((s) => !s)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
            {showSql ? "▾" : "▸"} Query text
          </button>
        ) : null}
        <span className="text-[11px] text-muted-foreground">
          {plan.nodes.length} operator{plan.nodes.length === 1 ? "" : "s"} · {fmtMs(plan.totalDuration)}
        </span>
        <button
          onClick={() => void copyText()}
          className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Copy the plan as text"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />} Copy as text
        </button>
      </div>
      {showSql && plan.queryText ? (
        <pre className="max-h-40 shrink-0 overflow-auto border-b border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-foreground">{plan.queryText}</pre>
      ) : null}

      {/* Body: graph + rail */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1">
          {plan.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">This statement produced no profiled operators.</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              className="bg-editor"
            >
              <Background color="var(--border)" gap={22} />
              <Controls className="!bottom-3 !left-3" showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                className="!bottom-3 !right-3"
                maskColor="color-mix(in srgb, var(--background) 55%, transparent)"
                nodeColor={(n) => {
                  const d = n.data as OperatorNodeData;
                  return d.isHot ? HOT_COLOR : resolveColor(OPERATOR_COLOR[d.node.operatorType]);
                }}
              />
            </ReactFlow>
          )}
        </div>
        <SideRail plan={plan} selected={selected} onJump={jumpTo} />
      </div>
    </div>
  );
}

// ── Custom operator node ─────────────────────────────────────────────────

function OperatorNode({ data }: NodeProps) {
  const { node, isHot, picked } = data as OperatorNodeData;
  const color = isHot ? HOT_COLOR : OPERATOR_COLOR[node.operatorType];
  const pct = Math.max(0, Math.min(100, node.costPercent ?? 0));
  const badge = OPERATOR_BADGE[node.operatorType] ?? "?";
  const hasWarnings = node.warnings.length > 0;
  const obj = node.objectName ? `${node.objectSchema ? node.objectSchema + "." : ""}${node.objectName}` : undefined;
  const isTemp = node.partInfo !== undefined && node.partInfo.toUpperCase().includes("TEMPORARY");
  return (
    <div
      className={cn(
        "flex w-[150px] flex-col items-center rounded-xl border bg-panel px-2 py-2 text-center shadow-sm transition",
        picked ? "border-primary ring-2 ring-primary/40" : "border-border/70 hover:border-primary/40",
        node.traits.isSystemStep && "opacity-80",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/50" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/50" />
      <div className="mb-1 flex w-full items-center justify-between">
        <span className="rounded bg-secondary px-1 py-px text-[8.5px] font-medium uppercase tracking-wide text-muted-foreground">{OPERATOR_TYPE_LABEL[node.operatorType]}</span>
        <span className={cn("text-[11px] font-semibold tabular-nums", isHot ? "text-destructive" : "text-muted-foreground")}>{fmtPct(node.costPercent)}</span>
      </div>
      <span
        className="relative flex h-[44px] w-[44px] items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${pct}%, color-mix(in srgb, var(--secondary) 85%, transparent) ${pct}% 100%)` }}
        title={`${OPERATOR_TYPE_LABEL[node.operatorType]} — ${fmtPct(node.costPercent)} of query time`}
      >
        <span className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-panel text-[13px] font-bold" style={{ color }}>{badge}</span>
        {hasWarnings ? (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-warning-foreground" title={node.warnings.map((w) => WARNING_LABEL[w.type]).join(", ")}>
            <AlertTriangle className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-foreground" title={node.operatorLabel}>{node.operatorLabel}</span>
      {node.duration !== undefined ? <span className="mt-0.5 text-[10px] text-muted-foreground">{fmtMs(node.duration)}</span> : null}
      {obj !== undefined ? (
        <span className={cn("max-w-full truncate text-[9.5px]", isTemp ? "italic text-muted-foreground/65" : "text-muted-foreground")} title={obj}>{obj}</span>
      ) : null}
    </div>
  );
}

const NODE_TYPES = { operator: OperatorNode };

// ── Right rail ─────────────────────────────────────────────────────────────

function SideRail({ plan, selected, onJump }: { plan: Plan; selected: PlanNode | undefined; onJump: (id: string) => void }) {
  const warnings = sortedWarningItems(plan);
  const breakdown = planCategoryBreakdown(plan);
  const cluster = planClusterSize(plan);
  const lacksDetail = planLacksDetailMetrics(plan);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-panel/40 p-3 [scrollbar-width:thin]">
      {selected ? <SelectedOperator node={selected} /> : (
        <RailCard title="Selected operator">
          <p className="text-[11px] text-muted-foreground">Click an operator in the graph to see its measured evidence.</p>
        </RailCard>
      )}

      {warnings.length ? (
        <RailCard title={`⚠ Warnings (${warnings.length})`} warning>
          <div className="space-y-1.5">
            {warnings.map(({ node, warning }, i) => (
              <button key={i} onClick={() => onJump(node.id)} className="block w-full rounded border border-warning/30 bg-warning/10 px-2 py-1.5 text-left hover:border-warning/60">
                <span className="block text-[10px] font-medium text-foreground">{WARNING_LABEL[warning.type]} · {node.operatorLabel} (part {node.id})</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{warning.message}</span>
              </button>
            ))}
          </div>
        </RailCard>
      ) : null}

      <RailCard title="Profile overview">
        <dl className="space-y-1 text-[11px]">
          <RailRow k="Session" v={plan.sessionId} />
          <RailRow k="Statement" v={plan.stmtId} />
          <RailRow k="Total time" v={fmtMs(plan.totalDuration)} />
          <RailRow k="Operators" v={`${plan.nodes.length}`} />
          <RailRow k="Nodes observed" v={cluster !== undefined ? String(cluster) : "not measured"} />
        </dl>
      </RailCard>

      <RailCard title="Time by category (of total)">
        {breakdown.length ? (
          <>
            <div className="mb-1.5 flex h-2.5 w-full overflow-hidden rounded">
              {breakdown.map((b) => (
                <span key={b.type} title={`${b.label} ${b.percent.toFixed(0)}%`} style={{ width: `${b.percent}%`, backgroundColor: b.color }} />
              ))}
            </div>
            <div className="space-y-0.5 text-[10.5px]">
              {breakdown.map((b) => (
                <div key={b.type} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: b.color }} />
                  <span className="text-foreground">{b.label}</span>
                  <span className="ml-auto font-mono text-muted-foreground">{fmtMs(b.durationSum)}</span>
                  <span className="w-8 text-right font-mono text-muted-foreground">{fmtPct(b.percent)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">not measured</p>
        )}
      </RailCard>

      {/* Evidence provenance: which profile view supplied the data. */}
      <RailCard title="Evidence source">
        <div className="flex items-start gap-2">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">{planSourceLabel(plan.source)}</span>
            <div className="mt-0.5 font-mono text-[10px]">
              {plan.source === "DETAILS" ? "$EXA_PROFILE_DETAILS_LAST_DAY" : plan.source === "DBA_SUMMARY" ? "EXA_DBA_PROFILE_LAST_DAY" : "EXA_USER_PROFILE_LAST_DAY"}
            </div>
            <div className="mt-0.5">
              {plan.perNodeStatsAvailable ? "Per-node (IPROC) rows present — skew is measured." : "Cluster-summary rows — per-node skew not measurable."}
            </div>
          </div>
        </div>
        {lacksDetail ? (
          <p className="mt-2 border-t border-border/60 pt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
            CPU/network/disk weren't captured for this run — reconnect with execution plans enabled and re-run.
          </p>
        ) : null}
      </RailCard>

      <RailCard title="Legend">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {LEGEND_ORDER.map((type) => (
            <div key={type} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ color: OPERATOR_COLOR[type], border: `1.5px solid ${OPERATOR_COLOR[type]}` }}>
                {OPERATOR_BADGE[type]}
              </span>
              {OPERATOR_TYPE_LABEL[type]}
            </div>
          ))}
        </div>
      </RailCard>
    </aside>
  );
}

/** The selected operator's full, evidence-cited detail — every row names the
 *  profile column it was measured from. Unmeasured values say so. */
function SelectedOperator({ node }: { node: PlanNode }) {
  const scanned = scannedSelectivity(node);
  const rows: Array<{ k: string; v: string | undefined; ev: string }> = [
    { k: "Duration", v: fmtMs(node.duration), ev: "DURATION" },
    { k: durationShareLabel(node), v: fmtPct(node.costPercent), ev: "DURATION ÷ query time" },
    { k: "CPU (max node)", v: fmtCpuPct(node.cpu), ev: "CPU" },
    { k: "Rows out", v: node.rowsOut !== undefined ? node.rowsOut.toLocaleString() : undefined, ev: "OUT_ROWS" },
    { k: "Scanned", v: scanned, ev: "OBJECT_ROWS → OUT_ROWS" },
    { k: "Net", v: node.net !== undefined ? fmtMiB(node.net) : undefined, ev: "NET" },
    { k: "Temp DB RAM peak", v: node.tempDbRamPeak !== undefined ? fmtMiB(node.tempDbRamPeak) : undefined, ev: "TEMP_DB_RAM_PEAK" },
    { k: "HDD write", v: node.hddWrite !== undefined ? fmtMiB(node.hddWrite) : undefined, ev: "HDD_WRITE" },
    { k: "HDD read", v: node.hddRead !== undefined && node.hddRead > 0 ? `${node.hddRead.toFixed(1)} MiB/s` : undefined, ev: "HDD_READ" },
    { k: "Per-node rows", v: node.perNodeStats ? `min ${node.perNodeStats.min} / max ${node.perNodeStats.max} / avg ${node.perNodeStats.avg.toFixed(0)} / nodes ${node.perNodeStats.nodeCount}` : undefined, ev: "OUT_ROWS by IPROC" },
    { k: "Per-node durations", v: node.perNodeDurationStats && node.perNodeDurationStats.max >= 0.001 ? `min ${fmtMs(node.perNodeDurationStats.min)} / max ${fmtMs(node.perNodeDurationStats.max)} / avg ${fmtMs(node.perNodeDurationStats.avg)}` : undefined, ev: "DURATION by IPROC" },
    { k: "Part info", v: node.partInfo, ev: "PART_INFO" },
    { k: "Remarks", v: node.remarks, ev: "REMARKS" },
  ];
  return (
    <RailCard title="Selected operator">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ color: OPERATOR_COLOR[node.operatorType], border: `1.5px solid ${OPERATOR_COLOR[node.operatorType]}` }}>
          {OPERATOR_BADGE[node.operatorType]}
        </span>
        <span className="truncate text-[12px] font-semibold text-foreground">{node.operatorLabel}</span>
      </div>
      {/* Evidence for the classification itself. */}
      <p className="mb-2 text-[10px] text-muted-foreground">
        Classified <span className="text-foreground">{OPERATOR_TYPE_LABEL[node.operatorType]}</span> from PART_NAME <span className="font-mono">"{node.operatorLabel}"</span> · part {node.id}
      </p>
      <dl className="space-y-1">
        {rows.filter((r) => r.v !== undefined).map((r) => (
          <div key={r.k} className="grid grid-cols-[1fr_auto] items-baseline gap-2">
            <dt className="text-[11px] text-muted-foreground">
              {r.k}
              <span className="ml-1 font-mono text-[9px] text-muted-foreground/60">{r.ev}</span>
            </dt>
            <dd className="text-right font-mono text-[11px] text-foreground">{r.v}</dd>
          </div>
        ))}
      </dl>
      {node.objectName ? (
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">Object <span className="font-mono text-foreground">{node.objectSchema ? node.objectSchema + "." : ""}{node.objectName}</span></p>
      ) : null}
      {node.warnings.length ? (
        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
          {node.warnings.map((w, i) => (
            <div key={i} className="rounded border border-warning/30 bg-warning/10 px-2 py-1.5">
              <p className="flex items-start gap-1.5 text-[11px] text-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <span>{w.message}</span>
              </p>
              {/* Raw evidence values that triggered the warning. */}
              <p className="mt-0.5 pl-4 font-mono text-[9.5px] text-muted-foreground">
                {Object.entries(w.detail).map(([k, v]) => `${k}=${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`).join("  ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </RailCard>
  );
}

// ── Small building blocks ────────────────────────────────────────────────

function RailCard({ title, warning, children }: { title: string; warning?: boolean; children: ReactNode }) {
  return (
    <section className={cn("rounded-lg border p-2.5", warning ? "border-warning/40 bg-warning/5" : "border-border bg-panel/50")}>
      <h4 className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{title}</h4>
      {children}
    </section>
  );
}

function RailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono text-foreground" title={v}>{v}</dd>
    </div>
  );
}

/** Resolve a CSS var color to a concrete value for the MiniMap (which paints on
 *  a canvas and can't read CSS vars). Falls back to a mid grey. */
function resolveColor(c: string): string {
  if (!c.startsWith("var(")) return c;
  if (typeof window === "undefined") return "#888";
  const name = c.slice(4, -1).trim();
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || "#888";
}
