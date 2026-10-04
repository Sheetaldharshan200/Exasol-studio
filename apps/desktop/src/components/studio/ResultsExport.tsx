// The results "Export" menu: the shown rows as CSV, Excel, JSON, SQL INSERT
// or Markdown through the save dialog, and — when the result was cut at the
// row limit — the whole result through ExaPump. Says how it went in place.

import { useEffect, useState } from "react";
import { Check, ChevronDown, Download, Loader2, TriangleAlert } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage, ipc, type ColumnMeta } from "@/lib/ipc";
import { formatRows, type CopyFormat } from "@/lib/result-copy";
import { toCsv } from "@/lib/result-stats";
import { fileName } from "./tabs";

type Status = { kind: "busy" | "done" | "error"; text: string } | null;

const TEXT_FORMATS: { format: CopyFormat; label: string; ext: string }[] = [
  { format: "csv", label: "CSV", ext: "csv" },
  { format: "json", label: "JSON", ext: "json" },
  { format: "insert", label: "SQL INSERT statements", ext: "sql" },
  { format: "markdown", label: "Markdown table", ext: "md" },
];

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export function ResultsExport({
  columns,
  rows,
  table,
  truncated,
  onExportAll,
}: {
  columns: ColumnMeta[];
  /** The rows shown (filtered), in result order. */
  rows: unknown[][];
  /** The INSERT target, when the result is one table. */
  table?: string;
  /** The result stopped at the row limit. */
  truncated: boolean;
  /** Export the statement's whole result with ExaPump; absent when not possible. */
  onExportAll?: (format: "csv" | "parquet") => Promise<string | null>;
}) {
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => {
    if (status?.kind !== "done") return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const run = async (what: string, save: () => Promise<string | null>) => {
    setStatus({ kind: "busy", text: `Exporting ${what}…` });
    try {
      const path = await save();
      setStatus(path ? { kind: "done", text: `Saved ${fileName(path)}` } : null);
    } catch (e) {
      setStatus({ kind: "error", text: errorMessage(e) });
    }
  };
  const base = `results-${stamp()}`;
  const shown = `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}`;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {status ? (
        <span
          title={status.text}
          className={`flex max-w-56 items-center gap-1 truncate text-[11px] ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {status.kind === "busy" ? <Loader2 className="h-3 w-3 animate-spin" /> : status.kind === "done" ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
          {status.text}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={status?.kind === "busy"}
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">The {shown} shown</DropdownMenuLabel>
          {TEXT_FORMATS.map((f) => (
            <DropdownMenuItem
              key={f.format}
              onClick={() =>
                void run(f.label, () =>
                  ipc.saveTextAs(`${base}.${f.ext}`, [f.ext], f.format === "csv" ? toCsv(columns, rows, { bom: true }) : formatRows(f.format, columns, rows, { table })),
                )
              }
            >
              {f.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => void run("Excel workbook", () => ipc.saveXlsxAs(`${base}.xlsx`, columns, rows))}>Excel workbook</DropdownMenuItem>
          {onExportAll ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                {truncated ? "Every row, not only those fetched" : "Every row, run again"} (ExaPump)
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void run("the whole result", () => onExportAll("csv"))}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void run("the whole result", () => onExportAll("parquet"))}>Parquet</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
