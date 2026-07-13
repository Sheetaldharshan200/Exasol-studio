import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Check, Database, Loader2, Play, Upload, X } from "lucide-react";
import { errorMessage, ipc, isTauri, type ConnectionProfile } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Line = { level: string; text: string };

function lineClass(level: string): string {
  if (level === "err") return "text-red-500";
  if (level === "cmd") return "text-blue-400";
  if (level === "success") return "text-green-500 font-semibold";
  if (level === "info") return "text-cyan-400";
  return "text-foreground/80";
}

/** Load a CSV/Parquet file into an Exasol table using ExaPump. */
export function LoadDataDialog({
  profile,
  filePath,
  fileName,
  onClose,
}: {
  profile: ConnectionProfile;
  filePath: string;
  fileName: string;
  onClose: () => void;
}) {
  const guessTable = fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  const isCsv = /\.(csv|tsv)$/i.test(fileName);

  const [schema, setSchema] = useState(profile.schema ?? "");
  const [table, setTable] = useState(guessTable);
  const [delimiter, setDelimiter] = useState(/\.tsv$/i.test(fileName) ? "\\t" : ",");
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [ok, setOk] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const unlisten = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    ipc.exapumpAvailable().then(setAvailable).catch(() => setAvailable(false));
    return () => {
      unlisten.current.forEach((u) => u());
      unlisten.current = [];
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const fullTable = schema ? `${schema}.${table}` : table;

  async function run(dryRun: boolean) {
    setLines([]);
    setPhase("running");
    if (isTauri()) {
      const onLog = await listen<{ line: string; level: string }>("load:log", (e) =>
        setLines((p) => [...p, { level: e.payload.level, text: e.payload.line }]),
      );
      const onDone = await listen<{ ok: boolean }>("load:done", (e) => {
        setOk(e.payload.ok);
        setPhase("done");
      });
      unlisten.current.push(onLog, onDone);
    }
    try {
      await ipc.exapumpUpload({
        host: profile.host,
        port: profile.port,
        user: profile.username,
        password: profile.password,
        schema: schema || undefined,
        tls: profile.sslMode !== "disabled",
        file: filePath,
        table: fullTable,
        delimiter: isCsv ? delimiter : undefined,
        dryRun,
      });
      if (!isTauri()) {
        setLines([
          { level: "cmd", text: `$ exapump upload ${fileName} --table ${fullTable}${dryRun ? " --dry-run" : ""}` },
          { level: "out", text: "Inferred 4 columns · loaded 1,240 rows" },
          { level: "success", text: dryRun ? "✓ Preview complete." : "✓ Upload complete." },
        ]);
        setOk(true);
        setPhase("done");
      }
    } catch (e) {
      setLines((p) => [...p, { level: "err", text: errorMessage(e) }]);
      setOk(false);
      setPhase("done");
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Upload className="h-4 w-4 text-primary" />
          <span className="flex-1 truncate text-[13px] font-semibold text-foreground">Load into Exasol · {fileName}</span>
          {phase !== "running" ? (
            <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {available === false ? (
          <div className="p-5 text-[12px] leading-relaxed text-muted-foreground">
            <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
              ExaPump isn’t installed. Install it from the <span className="font-medium">Marketplace</span> (ExaPump) — it’s a single
              prebuilt binary, no build required — then reopen this dialog.
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="h-8 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
                Close
              </button>
            </div>
          </div>
        ) : phase === "form" ? (
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">
                Schema (optional)
                <input value={schema} onChange={(e) => setSchema(e.target.value)} placeholder="MY_SCHEMA" className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground" />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Table
                <input value={table} onChange={(e) => setTable(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground" />
              </label>
            </div>
            {isCsv ? (
              <label className="block text-[11px] text-muted-foreground">
                Delimiter
                <input value={delimiter} onChange={(e) => setDelimiter(e.target.value)} className="mt-0.5 h-8 w-24 rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground" />
              </label>
            ) : null}
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Loads into <span className="font-mono text-foreground">{fullTable}</span> via ExaPump. The
              table is auto-created from the file if it doesn’t exist.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={() => run(true)}
                disabled={!table.trim()}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
              >
                Dry run
              </button>
              <button
                onClick={() => run(false)}
                disabled={!table.trim()}
                className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Load
              </button>
            </div>
          </div>
        ) : (
          <>
            <div ref={logRef} className="min-h-[180px] flex-1 overflow-auto bg-editor p-3 font-mono text-[11.5px] [scrollbar-width:thin]">
              {lines.map((l, i) => (
                <div key={i} className={cn("whitespace-pre-wrap break-words", lineClass(l.level))}>
                  {l.text}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              {phase === "running" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="flex-1 text-[12px] text-muted-foreground">Loading…</span>
                </>
              ) : (
                <>
                  {ok ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  <span className={cn("flex-1 text-[12px] font-medium", ok ? "text-primary" : "text-destructive")}>
                    {ok ? "Done." : "Failed."}
                  </span>
                  {phase === "done" ? (
                    <button onClick={() => setPhase("form")} className="h-7 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
                      Back
                    </button>
                  ) : null}
                  <button onClick={onClose} className="h-7 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
                    Close
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
