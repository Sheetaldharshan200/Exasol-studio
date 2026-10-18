// The load dialog's preview of the file and, when the target table already
// exists, which file column fills each table column (lib/load-mapping.ts).

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ipc, type TablePreview } from "@/lib/ipc";
import { defaultMapping } from "@/lib/load-mapping";
import { catalogName } from "@/lib/sql-completion-scope";

export type Mapping = { targets: string[]; mapping: (number | null)[] } | null;

export function LoadMapping({
  profileId,
  filePath,
  schema,
  table,
  canMap,
  onMapping,
  defaultSchema,
}: {
  profileId: string;
  filePath: string;
  schema: string;
  table: string;
  /** Mapping needs a CSV (ExaPump loads Parquet as it is). */
  canMap: boolean;
  onMapping: (m: Mapping) => void;
  /** The connection's schema, when the schema field is left empty. */
  defaultSchema?: string | null;
}) {
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [targets, setTargets] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<(number | null)[]>([]);

  useEffect(() => {
    ipc.fsReadTable(filePath, 20).then(setPreview).catch(() => setPreview(null));
  }, [filePath]);

  // An existing table: look its columns up (debounced while typing the name).
  useEffect(() => {
    setTargets(null);
    // As Exasol reads the names: unquoted folds to upper case.
    const s = schema.trim() || defaultSchema?.trim() || "";
    if (!canMap || !s || !table.trim()) return;
    let current = true;
    const t = setTimeout(() => {
      ipc
        .getTableDetails(profileId, catalogName(s), catalogName(table.trim()))
        .then((d) => current && setTargets(d.columns.length ? d.columns.map((c) => c.name) : null))
        .catch(() => current && setTargets(null));
    }, 400);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [profileId, schema, table, canMap, defaultSchema]);

  useEffect(() => {
    if (targets && preview) setMapping(defaultMapping(preview.columns, targets));
  }, [targets, preview]);
  useEffect(() => {
    onMapping(targets && preview ? { targets, mapping } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, mapping, preview]);

  const fileCols = preview?.columns ?? [];
  return (
    <div className="space-y-2">
      {preview ? (
        <div className="max-h-36 overflow-auto rounded-md border border-border [scrollbar-width:thin]">
          <table className="w-max min-w-full text-[11px]">
            <thead className="sticky top-0 bg-secondary text-left text-muted-foreground">
              <tr>
                {preview.columns.map((c, i) => (
                  <th key={i} className="px-2 py-1 font-medium whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {preview.rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  {r.map((v, j) => (
                    <td key={j} className="max-w-48 truncate px-2 py-0.5 text-foreground" title={v}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {targets && preview ? (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">
            The table exists. Each of its columns takes a file column (by name to start); an empty one loads NULL.
          </p>
          <div className="grid max-h-40 grid-cols-[1fr_1fr] gap-x-3 gap-y-1 overflow-auto pr-1 [scrollbar-width:thin]">
            {targets.map((t, ti) => (
              <div key={t} className="contents">
                <span className="truncate self-center font-mono text-[11.5px] text-foreground" title={t}>{t}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-7 items-center justify-between gap-1 rounded-md border border-border px-2 text-[11.5px] text-foreground hover:bg-secondary">
                      <span className="truncate">{mapping[ti] != null ? fileCols[mapping[ti]!] : <span className="text-muted-foreground">— NULL —</span>}</span>
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {[null, ...fileCols.map((_, i) => i)].map((src) => (
                      <DropdownMenuItem key={src ?? "null"} onClick={() => setMapping((m) => m.map((v, i) => (i === ti ? src : v)))}>
                        {src === mapping[ti] ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />}
                        {src === null ? "— NULL —" : fileCols[src]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
