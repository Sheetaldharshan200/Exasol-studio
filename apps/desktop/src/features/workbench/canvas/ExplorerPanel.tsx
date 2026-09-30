// The explorer beside the canvas: a connection, its schemas, and on a click
// the schema's tables and views. Clicking a table puts it on the canvas.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Database, Loader2, Search, Table2, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage, ipc, type ConnectionProfile, type SchemaObjects, type SchemaSummary } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "./context.ts";
import type { Conn } from "./store.ts";

type Objects = { tables: SchemaObjects["tables"]; views: SchemaObjects["views"] };

/** The open connections a canvas can read from, as a dropdown for the top bar. */
export function ConnectionPicker({ conn, value, onChange }: { conn: Conn; value: Conn; onChange: (c: Conn) => void }) {
  const [open, setOpen] = useState<ConnectionProfile[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all([ipc.listOpenConnections(), ipc.listConnectionProfiles()])
      .then(([ids, profiles]) => alive && setOpen(profiles.filter((p) => ids.includes(p.id))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conn.profileId]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="The connection the explorer reads from"
          className="flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11.5px] text-foreground hover:bg-secondary"
        >
          <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{value.connectionName}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {(open.length ? open : [{ id: conn.profileId, name: conn.connectionName } as ConnectionProfile]).map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => onChange({ profileId: p.id, connectionName: p.name })} className="text-[12px]">
            {p.id === value.profileId ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
            {p.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ExplorerPanel({ source }: { source: Conn }) {
  const store = useCanvasStore();
  const [schemas, setSchemas] = useState<SchemaSummary[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [objects, setObjects] = useState<Record<string, Objects | "loading" | { error: string }>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const requestSeq = useRef(0);
  const latest = useRef<Record<string, number>>({});

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
      // Only the latest request for this schema may fill it: an answer for a
      // connection no longer shown, or overtaken by a newer ask, is dropped.
      const asked = source.profileId;
      const token = ++requestSeq.current;
      latest.current[next] = token;
      const stillShown = () => sourceRef.current.profileId === asked && latest.current[next] === token;
      ipc.listSchemaObjects(asked, next)
        .then((o) => stillShown() && setObjects((m) => ({ ...m, [next]: { tables: o.tables, views: o.views } })))
        .catch((e) => stillShown() && setObjects((m) => ({ ...m, [next]: { error: errorMessage(e) } })));
    }
  };

  const q = filter.trim().toLowerCase();
  const shownSchemas = useMemo(() => (schemas ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || expanded === s.name), [schemas, q, expanded]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-panel text-[12px]">
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
