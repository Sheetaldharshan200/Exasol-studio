import { useEffect, useState } from "react";
import { Loader2, Table2 } from "lucide-react";
import { errorMessage, ipc, type TablePreview } from "@/lib/ipc";

/** Read-only grid preview of a tabular file (CSV / TSV / Parquet). */
export function FilePreviewPanel({ name, path }: { name: string; path: string }) {
  const [data, setData] = useState<TablePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    ipc
      .fsReadTable(path, 5000)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading {name}…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <Table2 className="h-3.5 w-3.5 text-teal" />
        <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
        <span className="rounded bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {data.format}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {data.rows.length} rows{data.truncated ? " (truncated)" : ""} · {data.columns.length} cols
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-secondary">
              <th className="border-r border-b border-border px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                #
              </th>
              {data.columns.map((c, i) => (
                <th
                  key={`${c}-${i}`}
                  className="border-r border-b border-border px-3 py-1.5 text-left font-medium text-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-transparent even:bg-secondary/30 hover:bg-accent/60">
                <td className="border-r border-b border-border px-2 py-1 text-right text-[10px] text-muted-foreground">
                  {ri + 1}
                </td>
                {data.columns.map((_, ci) => (
                  <td
                    key={ci}
                    className="max-w-[380px] truncate border-r border-b border-border px-3 py-1 text-foreground"
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
