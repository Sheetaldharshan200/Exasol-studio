// The SQL History toolbar: search the SQL and errors, show one connection,
// and export what is shown. The logic is lib/history-log.ts.

import { useMemo, useState } from "react";
import { Check, ChevronDown, Download, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ipc, type HistoryEntry } from "@/lib/ipc";
import { connectionsOf, historyExport, searchEntries } from "@/lib/history-log";

export function useHistoryFilter(entries: HistoryEntry[]) {
  const [text, setText] = useState("");
  const [connection, setConnection] = useState("");
  const connections = useMemo(() => connectionsOf(entries), [entries]);
  const shown = useMemo(() => searchEntries(entries, text, connection), [entries, text, connection]);
  const exportAs = (format: "csv" | "json") =>
    void ipc.saveTextAs(`sql-history.${format}`, [format], historyExport(shown, format)).catch(() => undefined);

  const toolbar = (
    <div className="flex items-center gap-1">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-1.5 h-3 w-3 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search history…"
          aria-label="Search history"
          className="h-6 w-40 rounded-md border border-border bg-background pr-2 pl-6 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>
      {connections.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-6 max-w-40 items-center gap-1 truncate rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
              {connection || "All connections"} <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {["", ...connections].map((c) => (
              <DropdownMenuItem key={c || "*"} onClick={() => setConnection(c)}>
                {c === connection ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />} {c || "All connections"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title="Export the entries shown"
            aria-label="Export history"
            disabled={!shown.length}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => exportAs("csv")}>Export {shown.length} as CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAs("json")}>Export {shown.length} as JSON</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return { shown, toolbar };
}
