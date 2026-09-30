// The rows with one column per decision, flagged rows first. The flag comes
// from any decision the person picks and the threshold they set; both change
// the order and the count without another model run.

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon as BxIcon } from "@/components/ui/icon";
import type { ColumnMeta } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { answerCell, flagValue, rankRows, toCsv, type Answer, type Question } from "./decisions";

export function ResultsGrid({
  columns,
  rows,
  questions,
  answers,
}: {
  columns: ColumnMeta[];
  rows: unknown[][];
  questions: Question[];
  answers: (Record<string, Answer> | null)[];
}) {
  const [flagOn, setFlagOn] = useState(questions[0]?.id ?? "");
  const [threshold, setThreshold] = useState(0.7);
  const question = questions.find((q) => q.id === flagOn) ?? questions[0];
  const flags = useMemo(() => rows.map((_, i) => (question ? flagValue(answers[i]?.[question.id], question) : null)), [rows, answers, question]);
  const { order, flagged } = useMemo(() => rankRows(rows.length, flags, threshold), [rows.length, flags, threshold]);

  function exportCsv() {
    const blob = new Blob([toCsv(columns, rows, questions, answers)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anomalies-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid min-h-0 gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">Flag on</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Decision that flags" className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-secondary">
              {question?.id ?? "—"}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {questions.map((q) => (
              <DropdownMenuItem key={q.id} onClick={() => setFlagOn(q.id)} className="font-mono text-[12px]">
                {q.id}
                {q.id === question?.id ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="flex items-center gap-2 text-muted-foreground">
          at least
          <input type="range" min={0} max={1} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Flag threshold" className="w-36 accent-primary" />
          <span className="w-10 font-mono text-[11px] text-foreground">{threshold.toFixed(2)}</span>
        </label>
        <span className="rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold text-primary">
          {flagged} of {rows.length} flagged
        </span>
        <button onClick={exportCsv} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-foreground hover:bg-secondary">
          <BxIcon name="download" className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      <div className="min-h-0 overflow-auto rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse text-[12px]">
          <thead className="sticky top-0 bg-panel">
            <tr>
              {questions.map((q) => (
                <th key={q.id} className="border-b border-border px-2 py-1.5 text-left font-mono text-[11px] font-semibold text-primary">
                  {q.id}
                </th>
              ))}
              {columns.map((c) => (
                <th key={c.name} className="border-b border-border px-2 py-1.5 text-left font-mono text-[11px] font-semibold text-muted-foreground">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((i) => {
              const hit = (flags[i] ?? -1) >= threshold;
              return (
                <tr key={i} className={cn("border-b border-border/60", hit && "bg-warning/10")}>
                  {questions.map((q) => {
                    const cell = answerCell(answers[i]?.[q.id], q);
                    return (
                      <td key={q.id} className="truncate px-2 py-1" title={cell.detail}>
                        <span className={cn(q.id === question?.id && hit ? "font-semibold text-foreground" : "text-foreground")}>{cell.text}</span>
                        <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground">{cell.detail}</span>
                      </td>
                    );
                  })}
                  {rows[i].map((v, j) => (
                    <td key={j} className="truncate px-2 py-1 text-muted-foreground" title={v === null || v === undefined ? "" : String(v)}>
                      {v === null || v === undefined ? <span className="italic opacity-60">null</span> : String(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
