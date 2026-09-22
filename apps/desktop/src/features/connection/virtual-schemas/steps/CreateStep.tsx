import { useState } from "react";
import { Check, CircleSlash2, Loader2 } from "lucide-react";
import { errorMessage, ipc } from "@/lib/ipc";
import { formatClock, formatElapsed } from "@/lib/elapsed";
import { useElapsedMs } from "@/lib/use-elapsed-ms";
import { cn } from "@/lib/utils";
import type { PlanStep } from "../plan.ts";
import { dropConnectionSql, dropVirtualSchemaSql, proveListTablesSql, proveSelectSql } from "../ddl.ts";

type StepState = "pending" | "running" | "done" | "failed";

export type ProveResult = {
  tables: string[];
  /** A handful of rows from the first table, as the grid would show them. */
  sample: { columns: string[]; rows: unknown[][] } | null;
};

/**
 * Step 5: run the plan, one statement per call (a script body may contain
 * semicolons, so nothing here goes through the splitter), then PROVE the
 * schema by reading from it. Created without a successful read is a failure.
 */
export function CreateStep({
  profileId,
  connectionName,
  plan,
  schemaName,
  connectionObjectName,
  prove,
  onCreated,
}: {
  profileId: string;
  connectionName: string;
  plan: PlanStep[];
  schemaName: string;
  connectionObjectName: string;
  prove: "listTables" | "select";
  onCreated: (result: ProveResult) => void;
}) {
  const [states, setStates] = useState<StepState[]>(() => plan.map(() => "pending"));
  // When each statement started and how long it took — a CREATE VIRTUAL SCHEMA
  // can sit on the adapter for a while, and the user must see that it is alive.
  const [timing, setTiming] = useState<Record<number, { startedAt: number; ms?: number }>>({});
  const runningIdx = states.indexOf("running");
  const runningElapsed = useElapsedMs(timing[runningIdx]?.startedAt, runningIdx >= 0);
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  const [result, setResult] = useState<ProveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [droppedAfterFailure, setDroppedAfterFailure] = useState(false);

  async function run(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    // split=false: the whole text is ONE statement. Adapter scripts contain
    // `;` in %scriptclass/%jar lines and would be shredded by the splitter.
    const resp = await ipc.executeSql(profileId, connectionName, sql, 50, false, true);
    const first = resp.results[0];
    if (!resp.success || first?.error) throw new Error(first?.error ?? "The statement failed.");
    return { columns: (first?.columns ?? []).map((c) => c.name), rows: first?.rows ?? [] };
  }

  async function start() {
    setBusy(true);
    setError(null);
    setDroppedAfterFailure(false);
    try {
      for (let i = 0; i < plan.length; i++) {
        const startedAt = Date.now();
        setTiming((t) => ({ ...t, [i]: { startedAt } }));
        setStates((s) => s.map((v, j) => (j === i ? "running" : v)));
        try {
          await run(plan[i].sql);
          setTiming((t) => ({ ...t, [i]: { startedAt, ms: Date.now() - startedAt } }));
          setStates((s) => s.map((v, j) => (j === i ? "done" : v)));
        } catch (e) {
          setTiming((t) => ({ ...t, [i]: { startedAt, ms: Date.now() - startedAt } }));
          setStates((s) => s.map((v, j) => (j === i ? "failed" : v)));
          setError({ at: plan[i].label, message: errorMessage(e) });
          return;
        }
      }
      // Prove it. Metadata first…
      const listed = await run(proveListTablesSql(schemaName));
      const tables = listed.rows.map((r) => String(r[0]));
      let sample: ProveResult["sample"] = null;
      // …then real rows, when the adapter reads rows (all of them do).
      if (prove === "select" && tables.length > 0) {
        sample = await run(proveSelectSql(schemaName, tables[0]));
      }
      const proved = { tables, sample };
      setResult(proved);
      // Tell the sidebar and any open visualizer of this database.
      window.dispatchEvent(new CustomEvent("studio:catalog-changed", { detail: { profileId } }));
      onCreated(proved);
    } catch (e) {
      // CREATE succeeded but reading did not: the schema exists and is broken.
      setError({ at: "Proving the schema", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function dropWhatWasCreated() {
    setBusy(true);
    try {
      await run(dropVirtualSchemaSql(schemaName)).catch(() => undefined);
      await run(dropConnectionSql(connectionObjectName)).catch(() => undefined);
      setDroppedAfterFailure(true);
      window.dispatchEvent(new CustomEvent("studio:catalog-changed", { detail: { profileId } }));
    } finally {
      setBusy(false);
    }
  }

  const started = states.some((s) => s !== "pending");

  return (
    <div className="grid gap-3">
      <ol className="grid gap-1.5">
        {plan.map((step, i) => (
          <li key={step.id} className="grid gap-1">
            <div className="flex items-center gap-2 text-[12px]">
              {states[i] === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : states[i] === "done" ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : states[i] === "failed" ? (
                <CircleSlash2 className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <span className="inline-block h-3.5 w-3.5 rounded-full border border-border" />
              )}
              <span className={cn(states[i] === "pending" ? "text-muted-foreground" : "text-foreground")}>{step.label}</span>
              {timing[i] ? (
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {states[i] === "running"
                    ? `running since ${formatClock(timing[i].startedAt)} · ${formatElapsed(runningElapsed)}`
                    : timing[i].ms !== undefined
                      ? formatElapsed(timing[i].ms)
                      : null}
                </span>
              ) : null}
            </div>
            <pre className="ml-5 max-h-40 overflow-auto rounded-md border border-border bg-editor p-2 font-mono text-[10.5px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {step.display}
            </pre>
          </li>
        ))}
      </ol>

      {!started ? (
        <button
          type="button"
          data-agent-id="add-source.create"
          onClick={() => void start()}
          disabled={busy}
          className="cta-glow inline-flex h-8 w-fit items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
        >
          Create and prove
        </button>
      ) : null}

      {error ? (
        <div className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-[12px] font-medium text-foreground">{error.at} failed</p>
          <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{error.message}</pre>
          {states.some((s) => s === "done") && !droppedAfterFailure ? (
            <button
              type="button"
              onClick={() => void dropWhatWasCreated()}
              disabled={busy}
              className="h-7 w-fit rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
            >
              Remove what was created
            </button>
          ) : null}
          {droppedAfterFailure ? <p className="text-[11px] text-muted-foreground">The schema and connection were removed. Nothing remote was touched.</p> : null}
        </div>
      ) : null}

      {result ? (
        <div className="grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
            <Check className="h-4 w-4 text-primary" /> Attached and proved — {result.tables.length} table{result.tables.length === 1 ? "" : "s"} visible
            {result.sample ? `, ${result.sample.rows.length} row${result.sample.rows.length === 1 ? "" : "s"} read from ${result.tables[0]}` : ""}.
          </p>
          {result.tables.length > 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">{result.tables.slice(0, 12).join(", ")}{result.tables.length > 12 ? ", …" : ""}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">The source has no tables in that schema yet — the schema is attached and will show them when they exist.</p>
          )}
          {result.sample && result.sample.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-[11px]">
                <thead>
                  <tr>{result.sample.columns.map((c) => <th key={c} className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.sample.rows.map((r, i) => (
                    <tr key={i}>{r.map((v, j) => <td key={j} className="px-2 py-0.5 font-mono text-foreground/90">{v === null || v === undefined ? "∅" : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
