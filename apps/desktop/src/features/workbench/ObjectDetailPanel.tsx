import { useEffect, useState } from "react";
import { Boxes, Columns3, Database, FileCode2, GraduationCap, Info, KeyRound, Loader2, Play, Shield, Table2, User } from "lucide-react";
import { errorMessage, ipc, type ColumnInfo, type ConstraintInfo, type UserDetails } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export type ObjectRef = { type: "schema" | "virtual-schema" | "table" | "view" | "user"; schema?: string; name: string };

type SubTab = { id: string; label: string; icon: typeof Info };

function qualify(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}

/** Generate a CREATE TABLE statement from column + constraint metadata. */
function tableDdl(schema: string | undefined, name: string, cols: ColumnInfo[], cons: ConstraintInfo[]): string {
  const lines = cols.map((c) => {
    let l = `  "${c.name}" ${c.dataType}`;
    if (c.default) l += ` DEFAULT ${c.default}`;
    if (c.nullable === false) l += " NOT NULL";
    return l;
  });
  const pk = cons.find((c) => c.constraintType === "PRIMARY KEY");
  if (pk) lines.push(`  CONSTRAINT "${pk.name}" PRIMARY KEY (${pk.columns.map((c) => `"${c.column}"`).join(", ")})`);
  const fks = cons.filter((c) => c.constraintType === "FOREIGN KEY");
  for (const fk of fks) {
    const cols2 = fk.columns.map((c) => `"${c.column}"`).join(", ");
    const ref = fk.columns[0];
    lines.push(
      `  CONSTRAINT "${fk.name}" FOREIGN KEY (${cols2}) REFERENCES ${qualify(ref?.referencedSchema ?? undefined, ref?.referencedTable ?? "?")} (${fk.columns.map((c) => `"${c.referencedColumn}"`).join(", ")})`,
    );
  }
  return `CREATE TABLE ${qualify(schema, name)} (\n${lines.join(",\n")}\n);`;
}

/**
 * Object detail tab (double-click / "Open details"): Info, Columns, Keys,
 * DDL for a table/view; Info + object counts for a schema.
 */
export function ObjectDetailPanel({
  profileId,
  connectionName,
  object,
  onOpenData,
}: {
  profileId: string;
  connectionName: string;
  object: ObjectRef;
  /** Run SELECT * against this object in a new query tab. */
  onOpenData: (sql: string) => void;
}) {
  const isTable = object.type === "table" || object.type === "view";
  const isUser = object.type === "user";
  const [tab, setTab] = useState("info");
  const [cols, setCols] = useState<ColumnInfo[]>([]);
  const [cons, setCons] = useState<ConstraintInfo[]>([]);
  const [counts, setCounts] = useState<{ tables: number; views: number; functions: number; scripts: number } | null>(null);
  const [userD, setUserD] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    if (isUser) {
      ipc
        .getUserDetails(profileId, object.name)
        .then((d) => alive && setUserD(d))
        .catch((e) => alive && setError(errorMessage(e)))
        .finally(() => alive && setLoading(false));
    } else if (isTable && object.schema) {
      ipc
        .getTableDetails(profileId, object.schema, object.name)
        .then((d) => {
          if (!alive) return;
          setCols(d.columns);
          setCons(d.constraints);
        })
        .catch((e) => alive && setError(errorMessage(e)))
        .finally(() => alive && setLoading(false));
    } else {
      ipc
        .listSchemaObjects(profileId, object.name)
        .then((o) => alive && setCounts({ tables: o.tables.length, views: o.views.length, functions: o.functions.length, scripts: o.scripts.length }))
        .catch((e) => alive && setError(errorMessage(e)))
        .finally(() => alive && setLoading(false));
    }
    return () => {
      alive = false;
    };
  }, [profileId, object.type, object.schema, object.name, isTable, isUser]);

  const subtabs: SubTab[] = isUser
    ? [
        { id: "info", label: "Info", icon: Info },
        { id: "roles", label: "Granted Roles", icon: GraduationCap },
        { id: "sysprivs", label: "System Privileges", icon: Shield },
        { id: "objprivs", label: "Object Privileges", icon: KeyRound },
        { id: "owned", label: "Owned Schemas", icon: Database },
      ]
    : isTable
      ? [
          { id: "info", label: "Info", icon: Info },
          { id: "columns", label: "Columns", icon: Columns3 },
          { id: "keys", label: "Keys & Constraints", icon: KeyRound },
          { id: "ddl", label: "DDL", icon: FileCode2 },
        ]
      : [
          { id: "info", label: "Info", icon: Info },
          { id: "objects", label: "Objects", icon: Boxes },
        ];

  const TypeIcon = isUser ? User : object.type === "table" ? Table2 : object.type.includes("schema") ? Database : Table2;
  const typeLabel = isUser ? "User" : object.type === "table" ? "Table" : object.type === "view" ? "View" : "Schema";

  return (
    <div className="flex h-full flex-col bg-editor">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-4 w-4 text-primary" />
          <span className="text-[14px] font-bold text-foreground">
            {typeLabel}: {object.name}
          </span>
          {isTable ? (
            <button
              onClick={() => onOpenData(`SELECT * FROM ${qualify(object.schema, object.name)} LIMIT 1000;`)}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary"
            >
              <Play className="h-3.5 w-3.5" /> Open data
            </button>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {object.schema ? `${object.schema}.` : ""}
          {object.name}
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2">
        {subtabs.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={cn(
                "flex h-9 items-center gap-1.5 border-b-2 px-3 text-[12.5px] transition-colors",
                tab === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-muted-foreground">{error}</div>
        ) : tab === "roles" ? (
          <StringList items={userD?.roles} empty="No roles granted." />
        ) : tab === "sysprivs" ? (
          <StringList items={userD?.systemPrivileges} empty="No system privileges granted." />
        ) : tab === "owned" ? (
          <StringList items={userD?.ownedSchemas} empty="Owns no schemas." />
        ) : tab === "objprivs" ? (
          (userD?.objectPrivileges.length ?? 0) ? (
            <table className="w-full border-collapse border border-border text-[12px]">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className="border border-border px-3 py-1.5">Schema</th>
                  <th className="border border-border px-3 py-1.5">Object</th>
                  <th className="border border-border px-3 py-1.5">Privilege</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {userD?.objectPrivileges.map((p, i) => (
                  <tr key={i} className="even:bg-secondary/30">
                    <td className="border border-border px-3 py-1 text-muted-foreground">{p.schema ?? ""}</td>
                    <td className="border border-border px-3 py-1 text-foreground">{p.object ?? ""}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">{p.privilege ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted-foreground">No object privileges granted.</p>
          )
        ) : tab === "info" ? (
          <PropTable
            rows={
              isUser
                ? (userD?.info ?? []).map((r) => [r.name, r.value ?? "—"] as [string, string])
                : isTable
                ? [
                    ["Schema", object.schema ?? "—"],
                    ["Name", object.name],
                    ["Type", object.type],
                    ["Columns", String(cols.length)],
                    ["Primary key", cons.find((c) => c.constraintType === "PRIMARY KEY")?.columns.map((c) => c.column).join(", ") || "—"],
                  ]
                : [
                    ["Schema name", object.name],
                    ["Type", object.type === "virtual-schema" ? "virtual" : "regular"],
                    ["Tables", String(counts?.tables ?? 0)],
                    ["Views", String(counts?.views ?? 0)],
                    ["Functions", String(counts?.functions ?? 0)],
                    ["Scripts", String(counts?.scripts ?? 0)],
                  ]
            }
          />
        ) : tab === "columns" ? (
          <table className="w-full border-collapse border border-border text-[12px]">
            <thead>
              <tr className="bg-secondary text-left">
                <th className="border border-border px-3 py-1.5">Column</th>
                <th className="border border-border px-3 py-1.5">Type</th>
                <th className="border border-border px-3 py-1.5">Nullable</th>
                <th className="border border-border px-3 py-1.5">Default</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {cols.map((c) => (
                <tr key={c.name} className="even:bg-secondary/30">
                  <td className="border border-border px-3 py-1 text-foreground">{c.name}</td>
                  <td className="border border-border px-3 py-1 text-muted-foreground">{c.dataType}</td>
                  <td className="border border-border px-3 py-1 text-muted-foreground">{c.nullable === false ? "NOT NULL" : "NULL"}</td>
                  <td className="border border-border px-3 py-1 text-muted-foreground">{c.default ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "keys" ? (
          cons.length ? (
            <table className="w-full border-collapse border border-border text-[12px]">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className="border border-border px-3 py-1.5">Name</th>
                  <th className="border border-border px-3 py-1.5">Type</th>
                  <th className="border border-border px-3 py-1.5">Columns</th>
                  <th className="border border-border px-3 py-1.5">References</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {cons.map((c) => (
                  <tr key={c.name} className="even:bg-secondary/30">
                    <td className="border border-border px-3 py-1 text-foreground">{c.name}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">{c.constraintType}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">{c.columns.map((x) => x.column).join(", ")}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">
                      {c.columns[0]?.referencedTable ? `${c.columns[0].referencedTable} (${c.columns.map((x) => x.referencedColumn).join(", ")})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted-foreground">No constraints.</p>
          )
        ) : tab === "ddl" ? (
          <pre className="overflow-auto rounded-lg border border-border bg-panel p-3 font-mono text-[12px] text-foreground [scrollbar-width:thin]">
            {tableDdl(object.schema, object.name, cols, cons)}
          </pre>
        ) : (
          <PropTable
            rows={[
              ["Tables", String(counts?.tables ?? 0)],
              ["Views", String(counts?.views ?? 0)],
              ["Functions", String(counts?.functions ?? 0)],
              ["Scripts", String(counts?.scripts ?? 0)],
            ]}
          />
        )}
      </div>
    </div>
  );
}

function StringList({ items, empty }: { items?: (string | null)[]; empty: string }) {
  if (!items || items.length === 0) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="rounded-md border border-border bg-panel px-2 py-1 font-mono text-[12px] text-foreground">
          {it}
        </span>
      ))}
    </div>
  );
}

function PropTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full max-w-xl border-collapse border border-border text-[12.5px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="even:bg-secondary/30">
            <td className="w-52 border border-border px-3 py-1.5 font-medium text-foreground">{k}</td>
            <td className="border border-border px-3 py-1.5 font-mono text-muted-foreground">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
