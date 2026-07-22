import { useEffect, useState } from "react";
import { Boxes, Columns3, Database, FileCode2, GraduationCap, HardDrive, Info, KeyRound, Loader2, Pencil, Play, Shield, Table2, User } from "lucide-react";
import { errorMessage, ipc, type ColumnInfo, type ConstraintInfo, type ObjectGrant, type ObjectSize, type UserDetails } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { TableStructureEditor, ColumnsColgroup } from "./TableStructureEditor";
import { TableKeysEditor } from "./TableKeysEditor";
import { TableInfoEditor } from "./TableInfoEditor";
import { UserPrivilegesEditor } from "./UserPrivilegesEditor";

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
  onOpenSql,
  onApplyDdl,
  navTab,
  navEdit,
  navNonce,
}: {
  profileId: string;
  connectionName: string;
  object: ObjectRef;
  /** Run SELECT * against this object in a new query tab. */
  onOpenData: (sql: string) => void;
  /** Open DDL in a new query tab (structure editor "Review SQL"). */
  onOpenSql?: (sql: string, title?: string) => void;
  /** Run DDL directly (structure editor "Confirm & Save"); returns first error. */
  onApplyDdl?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  /** Deep-link: which sub-tab to show, whether to open its editor, and a nonce
   *  that re-applies the navigation even when the tab was already open. */
  navTab?: string;
  navEdit?: boolean;
  navNonce?: number;
}) {
  const isTable = object.type === "table" || object.type === "view";
  const isUser = object.type === "user";
  const [tab, setTab] = useState("info");
  const [cols, setCols] = useState<ColumnInfo[]>([]);
  const [cons, setCons] = useState<ConstraintInfo[]>([]);
  const [counts, setCounts] = useState<{ tables: number; views: number; functions: number; scripts: number } | null>(null);
  const [userD, setUserD] = useState<UserDetails | null>(null);
  const [grants, setGrants] = useState<ObjectGrant[] | null>(null);
  const [size, setSize] = useState<ObjectSize | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStructure, setEditingStructure] = useState(false);
  const [editingKeys, setEditingKeys] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingUserPrivs, setEditingUserPrivs] = useState(false);
  // Bumped after a successful ALTER so the panel re-reads the table's shape.
  const [reloadKey, setReloadKey] = useState(0);

  // Deep-link: jump to the requested sub-tab (and open its editor) whenever the
  // navigation nonce changes — e.g. a right-click "Edit structure" in the tree.
  useEffect(() => {
    if (navNonce === undefined) return;
    if (navTab) setTab(navTab);
    if (navTab === "columns") { setEditingStructure(Boolean(navEdit)); }
    else if (navTab === "keys") { setEditingKeys(Boolean(navEdit)); }
    else if (navTab === "info") { setEditingInfo(Boolean(navEdit)); }
    else if (navTab === "roles" || navTab === "sysprivs") { setEditingUserPrivs(Boolean(navEdit)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navNonce]);

  // Grants + Size (schema & table/view) load lazily on first view.
  useEffect(() => {
    if (isUser) return;
    if (tab === "grants" && grants === null) {
      ipc.getObjectGrants(profileId, object.schema ?? object.name, isTable ? object.name : undefined).then(setGrants).catch(() => setGrants([]));
    }
    if (tab === "size" && size === null) {
      ipc.getObjectSize(profileId, object.schema ?? object.name, isTable ? object.name : undefined).then(setSize).catch(() => setSize(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
  }, [profileId, object.type, object.schema, object.name, isTable, isUser, reloadKey]);

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
          { id: "grants", label: "Grants", icon: Shield },
          { id: "size", label: "Size", icon: HardDrive },
          { id: "ddl", label: "DDL", icon: FileCode2 },
        ]
      : [
          { id: "info", label: "Info", icon: Info },
          { id: "objects", label: "Objects", icon: Boxes },
          { id: "grants", label: "Grants", icon: Shield },
          { id: "size", label: "Size", icon: HardDrive },
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
        ) : tab === "roles" || tab === "sysprivs" ? (
          isUser && editingUserPrivs ? (
            <UserPrivilegesEditor
              user={object.name}
              roles={(userD?.roles ?? []).filter((x): x is string => Boolean(x))}
              sysPrivs={(userD?.systemPrivileges ?? []).filter((x): x is string => Boolean(x))}
              onOpenSql={onOpenSql}
              onApply={onApplyDdl}
              onDone={() => { setEditingUserPrivs(false); setReloadKey((k) => k + 1); }}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {isUser && (onOpenSql || onApplyDdl) ? (
                <div className="mb-2 flex shrink-0 items-center justify-end">
                  <button onClick={() => setEditingUserPrivs(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary" title="Grant or revoke roles and system privileges">
                    <Pencil className="h-3.5 w-3.5" /> Edit roles &amp; privileges
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                <StringList items={tab === "roles" ? userD?.roles : userD?.systemPrivileges} empty={tab === "roles" ? "No roles granted." : "No system privileges granted."} />
              </div>
            </div>
          )
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
          isTable && object.type === "table" && editingInfo ? (
            <TableInfoEditor
              schema={object.schema}
              name={object.name}
              onOpenSql={onOpenSql}
              onApply={onApplyDdl}
              onDone={() => { setEditingInfo(false); setReloadKey((k) => k + 1); }}
            />
          ) : (
          <div className="flex h-full min-h-0 flex-col">
            {object.type === "table" && (onOpenSql || onApplyDdl) ? (
              <div className="mb-2 flex shrink-0 items-center justify-end">
                <button onClick={() => setEditingInfo(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary" title="Rename or set a comment">
                  <Pencil className="h-3.5 w-3.5" /> Rename / properties
                </button>
              </div>
            ) : null}
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
          </div>
          )
        ) : tab === "columns" ? (
          editingStructure && object.type === "table" ? (
            <TableStructureEditor
              schema={object.schema}
              table={object.name}
              columns={cols}
              constraints={cons}
              onOpenSql={onOpenSql}
              onApply={onApplyDdl}
              onDone={() => { setEditingStructure(false); setReloadKey((k) => k + 1); }}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {object.type === "table" && (onOpenSql || onApplyDdl) ? (
                <div className="mb-2 flex shrink-0 items-center justify-end">
                  <button
                    onClick={() => setEditingStructure(true)}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary"
                    title="Change columns, types, and primary key"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit structure
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full table-fixed border-collapse border border-border text-[12px]">
                  <ColumnsColgroup />
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className="border border-border px-2 py-1.5" title="Primary key"><KeyRound className="h-3.5 w-3.5 text-muted-foreground" /></th>
                      <th className="border border-border px-3 py-1.5">Column</th>
                      <th className="border border-border px-3 py-1.5">Type</th>
                      <th className="border border-border px-3 py-1.5">Nullable</th>
                      <th className="border border-border px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {cols.map((c) => {
                      const isPk = cons.some((k) => k.constraintType === "PRIMARY KEY" && k.columns.some((x) => x.column === c.name));
                      return (
                        <tr key={c.name} className="even:bg-secondary/30">
                          <td className="border border-border px-2 py-1 text-center">{isPk ? <KeyRound className="mx-auto h-3.5 w-3.5 text-primary" /> : null}</td>
                          <td className="truncate border border-border px-3 py-1 text-foreground" title={c.name}>{c.name}</td>
                          <td className="truncate border border-border px-3 py-1 text-muted-foreground" title={c.dataType}>{c.dataType}</td>
                          <td className="border border-border px-3 py-1 text-muted-foreground">{c.nullable === false ? "NOT NULL" : "NULL"}</td>
                          <td className="border border-border px-2 py-1" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : tab === "keys" ? (
          editingKeys && object.type === "table" ? (
            <TableKeysEditor
              schema={object.schema}
              table={object.name}
              columns={cols.map((c) => c.name)}
              constraints={cons}
              onOpenSql={onOpenSql}
              onApply={onApplyDdl}
              onDone={() => { setEditingKeys(false); setReloadKey((k) => k + 1); }}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {object.type === "table" && (onOpenSql || onApplyDdl) ? (
                <div className="mb-2 flex shrink-0 items-center justify-end">
                  <button onClick={() => setEditingKeys(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary" title="Add or drop primary keys, unique keys, and foreign keys">
                    <Pencil className="h-3.5 w-3.5" /> Edit keys & constraints
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                {cons.length ? (
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
                )}
              </div>
            </div>
          )
        ) : tab === "grants" ? (
          grants === null ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading grants…</div>
          ) : grants.length ? (
            <table className="w-full border-collapse border border-border text-[12px]">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className="border border-border px-3 py-1.5">Grantor</th>
                  <th className="border border-border px-3 py-1.5">Grantee</th>
                  <th className="border border-border px-3 py-1.5">Privilege</th>
                  <th className="border border-border px-3 py-1.5">Object</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {grants.map((g, i) => (
                  <tr key={i} className="even:bg-secondary/30">
                    <td className="border border-border px-3 py-1 text-muted-foreground">{g.grantor ?? ""}</td>
                    <td className="border border-border px-3 py-1 text-foreground">{g.grantee ?? ""}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">{g.privilege ?? ""}</td>
                    <td className="border border-border px-3 py-1 text-muted-foreground">{g.object ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted-foreground">No grants. (Reads EXA_[ALL|DBA]_OBJ_PRIVS.)</p>
          )
        ) : tab === "size" ? (
          size === null ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading size…</div>
          ) : (
            <PropTable
              rows={[
                ["RAW size (GiB, uncompressed)", String(size.rawSize ?? "—")],
                ["MEM size (GiB, compressed)", String(size.memSize ?? "—")],
                ...(isTable ? ([["Row count", String(size.rowCount ?? "—")]] as [string, string][]) : []),
                ["Created", String(size.created ?? "—")],
                ["Last commit", String(size.lastCommit ?? "—")],
              ]}
            />
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
