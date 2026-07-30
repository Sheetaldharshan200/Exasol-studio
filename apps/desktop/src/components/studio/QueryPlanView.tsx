/**
 * Query Performance — the execution-plan view, a faithful port of the
 * exasol-labs/exasol-vscode plan tab: a horizontal operator flow (cost rings +
 * connectors labeled with row counts), click-to-open per-operator popovers with
 * the full metric set, and a right rail (warnings summary, profile overview,
 * time-by-category bar, legend). Fed by the normalized Plan (lib/plan-model.ts);
 * all numbers/labels come from lib/plan-format.ts so the copied text matches
 * the on-screen cards exactly.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan, PlanNode } from "@/lib/plan-model";
import {
  OPERATOR_BADGE, OPERATOR_COLOR, OPERATOR_TYPE_LABEL, HOT_COLOR, WARNING_LABEL, LEGEND_ORDER,
  fmtMs, fmtRows, fmtPct, fmtMiB, fmtCpuPct,
  planCategoryBreakdown, planClusterSize, planLacksDetailMetrics, hottestNodeId, sortedWarningItems,
  middleTruncateCaption, scannedSelectivity, durationShareLabel, planSourceLabel, buildPlanText,
} from "@/lib/plan-format";

export function QueryPlanView({ plan, onOpenSql }: { plan: Plan; onOpenSql?: (sql: string, title?: string) => void }) {
  const [selected, setSelected] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jumped, setJumped] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hotId = hottestNodeId(plan);

  // Close the popover on Escape or an outside click.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const selectNode = useCallback((node: PlanNode, el: HTMLButtonElement | null) => {
    if (!el) return;
    setSelected((cur) => (cur?.id === node.id ? null : { id: node.id, rect: el.getBoundingClientRect() }));
  }, []);

  const jumpTo = useCallback((id: string) => {
    const el = nodeRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setSelected({ id, rect: el.getBoundingClientRect() });
    setJumped(id);
    window.setTimeout(() => setJumped((cur) => (cur === id ? null : cur)), 1400);
  }, []);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(buildPlanText(plan));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const selectedNode = selected ? plan.nodes.find((n) => n.id === selected.id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor" onClick={() => setSelected(null)}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {plan.queryText ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowSql((s) => !s); }}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {showSql ? "▾" : "▸"} Query text
          </button>
        ) : null}
        <button
          onClick={(e) => { e.stopPropagation(); void copyText(); }}
          className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Copy the plan as text"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />} Copy as text
        </button>
      </div>
      {showSql && plan.queryText ? (
        <pre className="max-h-40 shrink-0 overflow-auto border-b border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-foreground">{plan.queryText}</pre>
      ) : null}

      {/* Body: flow + rail */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
          {plan.nodes.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">This statement produced no profiled operators.</p>
          ) : (
            <div className="flex flex-wrap items-start gap-y-4">
              {plan.nodes.map((node, i) => (
                <div key={node.id} className="flex items-start">
                  {i > 0 ? <Connector prev={plan.nodes[i - 1]} /> : null}
                  <PlanNodeCard
                    node={node}
                    isHot={node.id === hotId}
                    jumped={jumped === node.id}
                    registerRef={(el) => { if (el) nodeRefs.current.set(node.id, el); else nodeRefs.current.delete(node.id); }}
                    onSelect={(el) => selectNode(node, el)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <SideRail plan={plan} onJump={jumpTo} />
      </div>

      {selectedNode && selected ? (
        <NodePopover node={selectedNode} anchor={selected.rect} onOpenSql={onOpenSql} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

// ── Operator node ────────────────────────────────────────────────────────

function PlanNodeCard({
  node, isHot, jumped, registerRef, onSelect,
}: {
  node: PlanNode;
  isHot: boolean;
  jumped: boolean;
  registerRef: (el: HTMLButtonElement | null) => void;
  onSelect: (el: HTMLButtonElement | null) => void;
}) {
  const color = isHot ? HOT_COLOR : OPERATOR_COLOR[node.operatorType];
  const pct = Math.max(0, Math.min(100, node.costPercent ?? 0));
  const badge = OPERATOR_BADGE[node.operatorType] ?? "?";
  const hasWarnings = node.warnings.length > 0;
  const objRaw = node.objectName ? `${node.objectSchema ? node.objectSchema + "." : ""}${node.objectName}` : undefined;
  const isTemp = node.partInfo !== undefined && node.partInfo.toUpperCase().includes("TEMPORARY");
  const ref = useRef<HTMLButtonElement | null>(null);

  return (
    <button
      ref={(el) => { ref.current = el; registerRef(el); }}
      onClick={(e) => { e.stopPropagation(); onSelect(ref.current); }}
      className={cn(
        "flex w-[118px] shrink-0 flex-col items-center rounded-lg px-1 py-1.5 text-center transition focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        node.traits.isSystemStep && "opacity-75",
        jumped && "ring-2 ring-primary",
      )}
      title={[fmtMs(node.duration), node.costPercent !== undefined ? fmtPct(node.costPercent) : undefined, hasWarnings ? `${node.warnings.length} warning${node.warnings.length === 1 ? "" : "s"}` : undefined].filter(Boolean).join(" · ")}
    >
      <span className={cn("mb-1 text-[11px] font-semibold tabular-nums", isHot ? "text-destructive" : "text-muted-foreground")}>
        {fmtPct(node.costPercent)}
      </span>
      <span
        className="relative flex h-[46px] w-[46px] items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${pct}%, color-mix(in srgb, var(--secondary) 85%, transparent) ${pct}% 100%)` }}
        title={OPERATOR_TYPE_LABEL[node.operatorType]}
      >
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-panel text-[13px] font-bold" style={{ color }}>
          {badge}
        </span>
        {hasWarnings ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[9px] text-warning-foreground"
            title={node.warnings.map((w) => WARNING_LABEL[w.type] ?? w.type).join(", ")}
            aria-hidden
          >
            <AlertTriangle className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-foreground">{node.operatorLabel}</span>
      <span className="text-[8.5px] font-medium uppercase tracking-wide text-muted-foreground">{node.operatorType.replace("_", " ")}</span>
      {node.duration !== undefined ? <span className="mt-0.5 text-[10px] text-muted-foreground">{fmtMs(node.duration)}</span> : null}
      {objRaw !== undefined ? (
        <span className={cn("max-w-full truncate text-[10px]", isTemp ? "italic text-muted-foreground/65" : "text-muted-foreground")} title={objRaw}>
          {middleTruncateCaption(objRaw)}
        </span>
      ) : null}
    </button>
  );
}

function Connector({ prev }: { prev: PlanNode }) {
  return (
    <div className="mt-[38px] flex w-11 shrink-0 flex-col items-center">
      <div className="relative h-0.5 w-full bg-border">
        <span className="absolute -right-0.5 -top-[5px] text-[10px] leading-none text-muted-foreground">→</span>
      </div>
      {prev.rowsOut !== undefined ? (
        <span className="mt-1 whitespace-nowrap text-[9px] text-muted-foreground">{fmtRows(prev.rowsOut)} row{prev.rowsOut === 1 ? "" : "s"}</span>
      ) : null}
    </div>
  );
}

// ── Popover ──────────────────────────────────────────────────────────────

function NodePopover({
  node, anchor, onClose, onOpenSql,
}: {
  node: PlanNode;
  anchor: DOMRect;
  onClose: () => void;
  onOpenSql?: (sql: string, title?: string) => void;
}) {
  void onOpenSql;
  // Position beside the anchor, clamped to the viewport. Prefer below, but flip
  // above when there isn't room — and cap the height to the available space so
  // the whole popover always stays on screen (it scrolls internally).
  const width = 264;
  const margin = 8;
  const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - margin);
  const spaceBelow = window.innerHeight - anchor.bottom - margin;
  const spaceAbove = anchor.top - margin;
  const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, Math.min(window.innerHeight * 0.6, placeAbove ? spaceAbove : spaceBelow));
  const pos: CSSProperties = placeAbove
    ? { left, bottom: window.innerHeight - anchor.top + 6, width, maxHeight }
    : { left, top: anchor.bottom + 6, width, maxHeight };
  const scanned = scannedSelectivity(node);
  const rows: Array<[string, string | undefined]> = [
    ["Duration", fmtMs(node.duration)],
    [durationShareLabel(node), fmtPct(node.costPercent)],
    ["CPU (max node)", fmtCpuPct(node.cpu)],
    ["Rows out", node.rowsOut !== undefined ? node.rowsOut.toLocaleString() : "—"],
    ["Scanned", scanned],
    ["Net", fmtMiB(node.net)],
    ["Temp DB RAM peak", fmtMiB(node.tempDbRamPeak)],
    ["HDD write", fmtMiB(node.hddWrite)],
    ["HDD read", node.hddRead !== undefined && node.hddRead > 0 ? `${node.hddRead.toFixed(1)} MiB/s` : undefined],
    ["Per-node rows", node.perNodeStats ? `min ${node.perNodeStats.min} / max ${node.perNodeStats.max} / avg ${node.perNodeStats.avg.toFixed(0)} / nodes ${node.perNodeStats.nodeCount}` : "not available"],
    ["Per-node durations", node.perNodeDurationStats && node.perNodeDurationStats.max >= 0.001 ? `min ${fmtMs(node.perNodeDurationStats.min)} / max ${fmtMs(node.perNodeDurationStats.max)} / avg ${fmtMs(node.perNodeDurationStats.avg)} / nodes ${node.perNodeDurationStats.nodeCount}` : undefined],
    ["Part info", node.partInfo],
    ["Remarks", node.remarks],
    ["Part id", node.id],
    ["Operator", `${node.operatorLabel} (${node.operatorType})`],
    ["Object", node.objectSchema ? `${node.objectSchema}.${node.objectName ?? ""}` : node.objectName],
    ["Traits", Object.entries(node.traits).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"],
  ];
  return (
    <div
      className="fixed z-50 overflow-auto rounded-lg border border-border bg-panel p-2.5 shadow-lg [scrollbar-width:thin]"
      style={pos}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-2 border-b border-border/60 pb-1.5">
        <span className="truncate text-[12px] font-semibold text-foreground">{node.operatorLabel}</span>
        <span className="ml-auto rounded bg-secondary px-1.5 py-px text-[9px] font-medium uppercase text-muted-foreground">{OPERATOR_TYPE_LABEL[node.operatorType]}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        {rows.filter(([, v]) => v !== undefined).map(([k, v]) => (
          <div key={k} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-words text-right font-mono text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {node.warnings.length ? (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">
          {node.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span>{w.message}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Right rail ─────────────────────────────────────────────────────────────

function SideRail({ plan, onJump }: { plan: Plan; onJump: (id: string) => void }) {
  const warnings = sortedWarningItems(plan);
  const breakdown = planCategoryBreakdown(plan);
  const cluster = planClusterSize(plan);
  const lacksDetail = planLacksDetailMetrics(plan);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-panel/40 p-3 [scrollbar-width:thin]">
      {warnings.length ? (
        <RailCard title={`⚠ Warnings (${warnings.length})`} warning>
          <div className="space-y-1.5">
            {warnings.map(({ node, warning }, i) => (
              <button
                key={i}
                onClick={() => onJump(node.id)}
                className="block w-full rounded border border-warning/30 bg-warning/10 px-2 py-1.5 text-left hover:border-warning/60"
              >
                <span className="block text-[10px] font-medium text-foreground">{node.operatorLabel} · part {node.id}</span>
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
          <RailRow k="Operators" v={`${plan.nodes.length} operator${plan.nodes.length === 1 ? "" : "s"}`} />
          <RailRow k="Nodes observed" v={cluster !== undefined ? String(cluster) : "not available"} />
          <RailRow k="Source" v={planSourceLabel(plan.source)} />
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
          <p className="text-[11px] text-muted-foreground">not available</p>
        )}
      </RailCard>

      {lacksDetail ? (
        <RailCard title="Want more detail?">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            CPU, network, and disk metrics weren't captured for this run. Reconnect with execution plans enabled, then run the query again.
          </p>
        </RailCard>
      ) : null}

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
