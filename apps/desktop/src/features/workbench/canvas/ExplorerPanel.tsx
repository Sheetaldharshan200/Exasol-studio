// The explorer beside the canvas: a connection, its schemas, and on a click
// the schema's tables and views. Clicking a table puts it on the canvas.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Database, Loader2, Search, Table2, Eye } from "lucide-react";
import { errorMessage, ipc, type ConnectionProfile, type SchemaObjects, type SchemaSummary } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "./context.ts";
import type { Conn } from "./store.ts";

type Objects = { tables: SchemaObjects["tables"]; views: SchemaObjects["views"] };

export function ExplorerPanel({ conn }: { conn: Conn }) {
  const store = useCanvasStore();
  const [source, setSource] = useState<Conn>(conn);
  const [open, setOpen] = useState<ConnectionProfile[]>([]);
  const [schemas, setSchemas] = useState<SchemaSummary[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [objects, setObjects] = useState<Record<string, Objects | "loading" | { error: string }>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The other open connections, so a canvas can read from more than one.
  useEffect(() => {
    let alive = true;
    void Promise.all([ipc.listOpenConnections(), ipc.listConnectionProfiles()]).then(([ids, profiles]) => {
      if (alive) setOpen(profiles.filter((p) => ids.includes(p.id)));
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conn.profileId]);

  useEffect(() => {
    let alive = true;
    setSchemas(null);
    setExpanded(null);
    setObjects({});
    setError(null);
    ipc.getDatabaseOverview(source.profileId)
      .then((o) => alive && setSchemas(o.schemas))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [source.profileId]);

  const expand = (schema: string) => {
    const next = expanded === schema ? null : schema;
    setExpanded(next);
    if (next && !objects[next]) {
      setObjects((m) => ({ ...m, [next]: "loading" }));
      ipc.listSchemaObjects(source.profileId, next)
        .then((o) => setObjects((m) => ({ ...m, [next]: { tables: o.tables, views: o.views } })))
        .catch((e) => setObjects((m) => ({ ...m, [next]: { error: errorMessage(e) } })));
    }
  };

  const q = filter.trim().toLowerCase();
  const shownSchemas = useMemo(() => (schemas ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || expanded === s.name), [schemas, q, expanded]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-panel text-[12px]">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
        {open.length > 1 ? (
          <select
            aria-label="Connection"
            value={source.profileId}
            onChange={(e) => {
              const p = open.find((x) => x.id === e.target.value);
              if (p) setSource({ profileId: p.id, connectionName: p.name });
            }}
            className="min-w-0 flex-1 truncate bg-transparent font-semibold text-foreground outline-none"
          >
            {open.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{source.connectionName}</span>
        )}
      </div>
      <label className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter schemas and tables" className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70" />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error ? <p className="px-3 py-2 text-destructive">{error}</p> : null}
        {schemas === null && !error ? (
          <p className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading schemas…
          </p>
        ) : null}
        {schemas?.length === 0 ? <p className="px-3 py-2 text-muted-foreground">No schemas on this connection.</p> : null}
        {shownSchemas.map((s) => {
          const isOpen = expanded === s.name;
          const objs = objects[s.name];
          return (
            <div key={s.name}>
              <button onClick={() => expand(s.name)} className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-secondary/60" title={s.isVirtual ? "Virtual: held by another system" : s.comment ?? undefined}>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{s.name}</span>
                {s.isVirtual ? <span className="shrink-0 rounded bg-primary/10 px-1 text-[9px] font-semibold uppercase text-primary">virtual</span> : null}
              </button>
              {isOpen ? (
                <div className="pb-1 pl-5">
                  {objs === "loading" || objs === undefined ? (
                    <p className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </p>
                  ) : "error" in objs ? (
                    <p className="px-2 py-1 text-destructive">{objs.error}</p>
                  ) : (
                    <ObjectList schema={s.name} objects={objs} filter={q} onOpen={(table, rowCount) => store.getState().openTable({ schema: s.name, table, rowCount }, source)} />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ObjectList({ schema, objects, filter, onOpen }: { schema: string; objects: Objects; filter: string; onOpen: (table: string, rowCount: number | null) => void }) {
  const rows = [
    ...objects.tables.map((t) => ({ name: t.name, view: false, rowCount: t.rowCount })),
    ...objects.views.map((v) => ({ name: v.name, view: true, rowCount: null as number | null })),
  ].filter((o) => !filter || o.name.toLowerCase().includes(filter) || schema.toLowerCase().includes(filter));
  if (!rows.length) return <p className="px-2 py-1 text-muted-foreground">Nothing in this schema.</p>;
  return (
    <ul>
      {rows.map((o) => (
        <li key={`${o.view ? "v" : "t"}-${o.name}`}>
          <button onClick={() => onOpen(o.name, o.rowCount)} title={`Open ${schema}.${o.name} on the canvas`} className={cn("flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-foreground hover:bg-primary/10 hover:text-primary")}>
            {o.view ? <Eye className="h-3 w-3 shrink-0 text-muted-foreground" /> : <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {o.rowCount != null ? <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.rowCount.toLocaleString()}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
