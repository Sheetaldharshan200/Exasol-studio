import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Table2, Trash2 } from "lucide-react";
import { errorMessage, ipc, type TablePreview } from "@/lib/ipc";
import { pageWindow } from "./open-file";

const PAGE_SIZE = 1000;

/**
 * Grid preview of a tabular file (CSV / TSV / Parquet), one window at a time:
 * the backend streams `offset..offset+1000`, the total is counted lazily in a
 * second call, and a 5-million-row file costs the same as a 5-row one.
 * CSV/TSV can still be opened as text — on purpose, with a warning for big ones.
 */
export function FilePreviewPanel({
  name,
  path,
  onEdit,
  onDelete,
}: {
  name: string;
  path: string;
  /** Open the file as editable text (CSV/TSV only). */
  onEdit?: () => void;
  /** Delete the file (already confirmed) and close this tab. */
  onDelete?: () => void;
}) {
  const [data, setData] = useState<TablePreview | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState("");

  // The file changed: back to page one, forget the total.
  useEffect(() => {
    setPage(1);
    setTotal(null);
    setData(null);
  }, [path]);

  // The window is derived from (page, total); the fetch keys on its OFFSET, so
  // the total arriving later never re-reads the same rows, and a page past the
  // end (typed before the total was known) snaps back into range.
  const w = pageWindow(page, PAGE_SIZE, total);
  useEffect(() => {
    if (w.page !== page) setPage(w.page);
  }, [w.page, page]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    ipc
      .fsReadTable(path, PAGE_SIZE, w.offset)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, w.offset]);

  // Count once, after the first window painted — never before it.
  useEffect(() => {
    if (!data || total !== null) return;
    let alive = true;
    ipc
      .fsCountRows(path)
      .then((n) => alive && setTotal(n))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [data, total, path]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading {name}…
      </div>
    );
  }

  const pages = w.pages;
  const first = data.offset + 1;
  const last = data.offset + data.rows.length;
  const canNext = data.hasMore || (pages !== null && page < pages);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <Table2 className="h-3.5 w-3.5 text-teal" />
        <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
        <span className="rounded bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">{data.format}</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {data.rows.length === 0 ? "no rows" : `rows ${first.toLocaleString()}–${last.toLocaleString()}`}
          {total !== null ? ` of ${total.toLocaleString()}` : data.hasMore ? " of many…" : ""} · {data.columns.length} cols
        </span>
        {onEdit && (data.format === "CSV" || data.format === "TSV") ? (
          <button
            onClick={onEdit}
            title={total !== null && total > 50_000 ? "Large file — the text editor loads all of it" : "Edit as text"}
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> {total !== null && total > 50_000 ? "Edit as text anyway" : "Edit"}
          </button>
        ) : null}
        {onDelete ? (
          <button
            onClick={() => {
              if (window.confirm(`Delete “${name}”? This cannot be undone.`)) onDelete();
            }}
            title="Delete file"
            className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:border-destructive/50 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto p-px">
        {loading ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-[11px] text-muted-foreground shadow"><Loader2 className="h-3 w-3 animate-spin" /> Loading rows…</span>
          </div>
        ) : null}
        <table className="w-full border-collapse border border-border text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-secondary">
              <th className="border-r border-b border-border px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">#</th>
              {data.columns.map((c, i) => (
                <th key={`${c}-${i}`} className="border-r border-b border-border px-3 py-1.5 text-left font-medium text-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-transparent even:bg-secondary/30 hover:bg-accent/60">
                <td className="border-r border-b border-border px-2 py-1 text-right text-[10px] text-muted-foreground">{(data.offset + ri + 1).toLocaleString()}</td>
                {data.columns.map((_, ci) => (
                  <td key={ci} className="max-w-[380px] truncate border-r border-b border-border px-3 py-1 text-foreground">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="p-6 text-center text-[12px] text-muted-foreground">{data.columns.length ? "No rows in this file." : "Empty file."}</p> : null}
      </div>
      {(pages !== null && pages > 1) || data.hasMore || w.page > 1 ? (
        <footer className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-[11.5px] text-muted-foreground">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} aria-label="Previous page" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono">
            Page {w.page.toLocaleString()}
            {pages !== null ? ` of ${pages.toLocaleString()}` : ""}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!canNext || loading} aria-label="Next page" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <form
            className="ml-auto flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const row = Number(jump.replace(/[^\d]/g, ""));
              if (row > 0) setPage(Math.floor((row - 1) / PAGE_SIZE) + 1);
              setJump("");
            }}
          >
            <label htmlFor="preview-jump">Jump to row</label>
            <input id="preview-jump" value={jump} onChange={(e) => setJump(e.target.value)} inputMode="numeric" placeholder="1000000" className="h-6 w-24 rounded-md border border-border bg-panel px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/60" />
          </form>
        </footer>
      ) : null}
    </div>
  );
}
