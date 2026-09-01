import { useCallback, useEffect, useState } from "react";
import { BookUser, Boxes, ChevronRight, GaugeCircle, HardDrive, KeyRound, Loader2, Lock, Pencil, Plug, Plus, RotateCcw, Save, Shield, ShieldCheck, ShieldOff, Trash2, Users, X } from "lucide-react";
import { errorMessage, ipc, type DbaOverview, type UserDetails } from "@/lib/ipc";
import { ALL_SYS_PRIVS, dbaSql, ident, OBJ_PRIVS_SCHEMA, OBJ_PRIVS_TABLE, SYS_PRIVS } from "@/features/workbench/dba-sql";
import { cn } from "@/lib/utils";
import { AppSelect } from "@/components/ui/app-select";

type Section = "users" | "roles" | "consumerGroups" | "connections" | "sessions" | "dbSize";
const TABS: { id: Section; label: string; icon: typeof Users }[] = [
  { id: "sessions", label: "Sessions", icon: GaugeCircle },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "consumerGroups", label: "Consumer Groups", icon: Boxes },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "dbSize", label: "DB Size", icon: HardDrive },
];

/** Live RBAC of the CONNECTED user — read from the DB, which stays the real
 *  authority. The UI only mirrors it so users aren't offered actions the
 *  database would reject. */
type Caps = { user: string; dba: boolean; sys: Set<string> };
function cap(c: Caps | null, priv: string): boolean {
  return !!c && (c.dba || c.sys.has(priv));
}

/** A pending admin action, described in plain language (not SQL). */
type ActKind = "delete" | "save" | "create" | "key" | "kill";
type Pending = {
  kind: ActKind;
  title: string;
  now?: string;
  after: string;
  recoverable: boolean;
  sql: string[];
};
const ACT: Record<ActKind, { icon: typeof Trash2; verb: string; danger: boolean }> = {
  delete: { icon: Trash2, verb: "Delete", danger: true },
  kill: { icon: X, verb: "Kill", danger: true },
  save: { icon: Save, verb: "Save", danger: false },
  create: { icon: Plus, verb: "Create", danger: false },
  key: { icon: KeyRound, verb: "Update", danger: false },
};

/**
 * DBA console (EXA_DBA_* views) with administration: users, roles, privileges,
 * sessions. Admin actions are gated by the connected user's live privileges;
 * every change is confirmed in plain language (what it is now → what happens →
 * whether it's recoverable), with the SQL available but not the headline.
 */
export function DbaDashboard({ profileId, connectionName, onOpenSql }: { profileId: string; connectionName: string; onOpenSql: (sql: string, title?: string) => void }) {
  const [dba, setDba] = useState<DbaOverview | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Section>("sessions");
  const [notice, setNotice] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ name: string; isRole: boolean } | null>(null);

  const col1 = useCallback(
    async (sql: string): Promise<string[]> => {
      const res = await ipc.executeSql(profileId, connectionName, sql, 5000, false);
      const first = res.results.find((r) => r.kind === "resultSet");
      return first && !first.error ? first.rows.map((r) => String(r[0] ?? "")) : [];
    },
    [profileId, connectionName],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    ipc.getDbaOverview(profileId).then(setDba).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
    // The USER_* views expose the CURRENT user's own grants — no DBA needed —
    // so the probe works for everyone and reflects exactly what they can do.
    // SYS is the built-in superuser and often does NOT list the DBA role/privs
    // in those views, so treat it (and anyone able to read EXA_DBA_USERS) as an
    // admin explicitly — otherwise the default local-DB admin can't manage anyone.
    Promise.all([
      col1("SELECT CURRENT_USER"),
      col1("SELECT GRANTED_ROLE FROM EXA_USER_ROLE_PRIVS"),
      col1("SELECT PRIVILEGE FROM EXA_USER_SYS_PRIVS"),
    ])
      .then(([who, roles, sys]) => {
        const me = (who[0] ?? "").toUpperCase();
        setCaps({ user: me || "(unknown)", dba: me === "SYS" || roles.includes("DBA"), sys: new Set(sys) });
      })
      .catch(() => setCaps({ user: "(unknown)", dba: false, sys: new Set() }));
  }, [profileId, col1]);
  useEffect(load, [load]);

  const canCreateUser = cap(caps, "CREATE USER");
  const canAlterUser = cap(caps, "ALTER USER");
  const canDropUser = cap(caps, "DROP USER");
  const canCreateRole = cap(caps, "CREATE ROLE");
  const canDropRole = caps?.dba || cap(caps, "DROP ANY ROLE");
  const canGrantRole = caps?.dba || cap(caps, "GRANT ANY ROLE");
  const canGrantPriv = caps?.dba || cap(caps, "GRANT ANY PRIVILEGE");
  const canGrantObj = caps?.dba || cap(caps, "GRANT ANY OBJECT PRIVILEGE");
  const canManagePrivs = Boolean(canGrantRole || canGrantPriv || canGrantObj);
  const canKill = caps?.dba || cap(caps, "KILL ANY SESSION");
  const isAdmin = Boolean(canCreateUser || canDropUser || canAlterUser || canCreateRole || canDropRole || canManagePrivs || canKill);

  // Open the generated SQL in a query tab (the single review/run surface).
  // Nothing executes from the DBA UI — the user runs it in the editor and sees
  // results/errors there.
  // Every action opens as SQL in a query tab — no dialogs. A comment header
  // carries the plain-language context (what it does, recoverability) so the
  // user reviews and runs it in one place.
  const ask = (p: Pending) => {
    const header = [
      `-- ${p.title}`,
      p.now ? `-- Now: ${p.now}` : "",
      `-- After: ${p.after}`,
      p.recoverable ? "-- Recoverable." : "-- WARNING: this cannot be undone.",
    ].filter(Boolean).join("\n");
    onOpenSql(`${header}\n${p.sql.join(";\n")};\n`, p.title);
    setNotice(`Opened in a SQL tab — review and run: ${p.title}`);
    setDrawer(null);
  };

  return (
    <div className="relative flex h-full flex-col bg-editor">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <BookUser className="h-4 w-4 text-primary" />
        <span className="text-[14px] font-bold text-foreground">DBA · {connectionName}</span>
        {caps ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            signed in as <span className="font-mono text-foreground">{caps.user}</span>
            <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", isAdmin ? "bg-primary/12 text-primary" : "bg-secondary text-muted-foreground")}>
              {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {caps.dba ? "DBA" : isAdmin ? "Admin" : "Read-only"}
            </span>
            <button onClick={() => setDrawer({ name: caps.user, isRole: false })} className="rounded px-1 text-[10.5px] underline-offset-2 hover:text-foreground hover:underline">my privileges</button>
          </span>
        ) : null}
        {notice ? (
          <span className={cn("ml-1 truncate text-[11.5px]", notice.startsWith("Failed") ? "text-destructive" : "text-primary")}>{notice}</span>
        ) : null}
        <button onClick={load} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary">Refresh</button>
      </header>

      {caps && !isAdmin ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/8 px-4 py-1.5 text-[11.5px] text-muted-foreground">
          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-warning" />
          You don't have administration privileges on this database — viewing only. Ask a DBA to grant CREATE USER, GRANT ANY ROLE, etc.
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = dba ? (t.id === "dbSize" ? undefined : (dba[t.id] as unknown[]).length) : undefined;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[12.5px] transition-colors", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
              {n != null ? <span className="rounded bg-secondary px-1 font-mono text-[10px]">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : error ? (
            <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-muted-foreground">{error}</div>
          ) : !dba ? null : tab === "dbSize" ? (
            <Grid columns={["Measure time", "Raw size", "Mem size", "Auxiliary", "Statistics", "Recommended RAM"]} rows={dba.dbSize ? [[dba.dbSize.measureTime, dba.dbSize.rawObjectSize, dba.dbSize.memObjectSize, dba.dbSize.auxiliarySize, dba.dbSize.statisticsSize, dba.dbSize.recommendedDbRamSize].map((v) => (v == null ? "" : String(v)))] : []} />
          ) : tab === "users" ? (
            <>
              {canCreateUser ? <ActionBar label="Add user" onClick={() => ask({ kind: "create", title: "Create user", after: "Fill in the name/password, then run.", recoverable: true, sql: ['-- Replace NEW_USER and the password, then run\nCREATE USER NEW_USER IDENTIFIED BY "change-me"', "GRANT CREATE SESSION TO NEW_USER"] })} /> : null}
              <Grid
                columns={["Name", "Created", "Consumer group", "Comment", ""]}
                rows={dba.users.map((u) => [u.name, u.created ?? "", u.consumerGroup ?? "", u.comment ?? ""])}
                actions={(row) => {
                  const name = row[0];
                  const sys = name === "SYS";
                  return (
                    <span className="flex items-center justify-end gap-0.5">
                      {canManagePrivs ? <RowBtn title="Privileges" onClick={() => setDrawer({ name, isRole: false })}><ShieldCheck className="h-3.5 w-3.5" /></RowBtn> : null}
                      {canAlterUser ? <RowBtn title="Change password" onClick={() => ask({ kind: "key", title: `Change password — ${name}`, now: `${name}\u2019s current password stays until this runs.`, after: `${name} signs in with the new password.`, recoverable: true, sql: [`-- Set a new password, then run\n${dbaSql.changePassword(name, "new-password")}`] })}><KeyRound className="h-3.5 w-3.5" /></RowBtn> : null}
                      {canAlterUser ? <RowBtn title="Rename" disabled={sys} onClick={() => ask({ kind: "save", title: `Rename ${name}`, after: "Objects and grants are unchanged.", recoverable: true, sql: [`-- Replace NEW_NAME, then run\n${dbaSql.renameUser(name, "NEW_NAME")}`] })}><Pencil className="h-3.5 w-3.5" /></RowBtn> : null}
                      {canDropUser ? (
                        <RowBtn title={sys ? "SYS cannot be dropped" : "Delete user"} danger disabled={sys} onClick={() => ask({
                          kind: "delete",
                          title: `Delete user ${name}`,
                          now: `${name} can sign in and may own schemas, tables and other objects.`,
                          after: `${name} is removed, along with every schema and object they own (CASCADE).`,
                          recoverable: false,
                          sql: [dbaSql.dropUser(name, true)],
                        })}><Trash2 className="h-3.5 w-3.5" /></RowBtn>
                      ) : null}
                    </span>
                  );
                }}
              />
            </>
          ) : tab === "roles" ? (
            <>
              {canCreateRole ? <ActionBar label="Add role" onClick={() => ask({ kind: "create", title: "Create role", after: "Name the role, then run; add privileges after.", recoverable: true, sql: ["-- Replace NEW_ROLE, then run\nCREATE ROLE NEW_ROLE"] })} /> : null}
              <Grid
                columns={["Name", "Created", "Consumer group", "Comment", ""]}
                rows={dba.roles.map((r) => [r.name, r.created ?? "", r.consumerGroup ?? "", r.comment ?? ""])}
                actions={(row) => {
                  const name = row[0];
                  const builtin = name === "DBA" || name === "PUBLIC";
                  return (
                    <span className="flex items-center justify-end gap-0.5">
                      {canManagePrivs ? <RowBtn title="Privileges" onClick={() => setDrawer({ name, isRole: true })}><ShieldCheck className="h-3.5 w-3.5" /></RowBtn> : null}
                      {canDropRole ? (
                        <RowBtn title={builtin ? `${name} is built-in` : "Delete role"} danger disabled={builtin} onClick={() => ask({
                          kind: "delete",
                          title: `Delete role ${name}`,
                          now: `${name} is granted to some users, giving them its privileges.`,
                          after: `${name} is removed and revoked from everyone who had it.`,
                          recoverable: false,
                          sql: [dbaSql.dropRole(name, true)],
                        })}><Trash2 className="h-3.5 w-3.5" /></RowBtn>
                      ) : null}
                    </span>
                  );
                }}
              />
            </>
          ) : tab === "consumerGroups" ? (
            <Grid columns={["Name", "CPU weight", "Precedence", "Query timeout", "Idle timeout"]} rows={dba.consumerGroups.map((g) => [g.name, g.cpuWeight, g.precedence, g.queryTimeout, g.idleTimeout].map((v) => (v == null ? "" : String(v))))} />
          ) : tab === "connections" ? (
            <Grid columns={["Name", "Connection string", "User", "Created", "Comment"]} rows={dba.connections.map((c) => [c.name, c.connectionString ?? "", c.userName ?? "", c.created ?? "", c.comment ?? ""])} />
          ) : (
            <Grid
              columns={["Session", "User", "Status", "Command", "Duration", "Client", "Login time", ""]}
              rows={dba.sessions.map((s) => [s.sessionId, s.userName ?? "", s.status ?? "", s.command ?? "", s.duration ?? "", s.client ?? "", s.loginTime ?? ""])}
              actions={(row) =>
                canKill ? (
                  <RowBtn title="Kill session" danger onClick={() => ask({
                    kind: "kill",
                    title: `Kill session ${row[0]}`,
                    now: `Session ${row[0]}${row[1] ? ` (user ${row[1]})` : ""} is active${row[3] ? `, running ${row[3]}` : ""}.`,
                    after: "The session is terminated and its current statement is rolled back.",
                    recoverable: true,
                    sql: [dbaSql.killSession(row[0])],
                  })}><X className="h-3.5 w-3.5" /></RowBtn>
                ) : null
              }
            />
          )}
        </div>

        {drawer ? (
          <PrivilegesDrawer
            profileId={profileId}
            connectionName={connectionName}
            grantee={drawer.name}
            isRole={drawer.isRole}
            roles={dba?.roles.map((r) => r.name) ?? []}
            canGrantRole={Boolean(canGrantRole)}
            canGrantPriv={Boolean(canGrantPriv)}
            canGrantObj={Boolean(canGrantObj)}
            onAsk={ask}
            onClose={() => setDrawer(null)}
          />
        ) : null}
      </div>

    </div>
  );
}

function ActionBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mb-3 flex items-center">
      <button onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85">
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
    </div>
  );
}

function RowBtn({ title, onClick, danger, disabled, children }: { title: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cn("flex h-6 w-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30", danger ? "hover:text-destructive" : "hover:bg-secondary hover:text-foreground")}>
      {children}
    </button>
  );
}

function PrivilegesDrawer({ profileId, connectionName, grantee, isRole, roles, canGrantRole, canGrantPriv, canGrantObj, onAsk, onClose }: { profileId: string; connectionName: string; grantee: string; isRole: boolean; roles: string[]; canGrantRole: boolean; canGrantPriv: boolean; canGrantObj: boolean; onAsk: (p: Pending) => void; onClose: () => void }) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roleToGrant, setRoleToGrant] = useState("");
  const [adminOption, setAdminOption] = useState(false);
  const [privToGrant, setPrivToGrant] = useState("");
  const [objSchema, setObjSchema] = useState("");
  const [objName, setObjName] = useState("");
  const [objPriv, setObjPriv] = useState("SELECT");
  const [schemas, setSchemas] = useState<string[]>([]);

  useEffect(() => {
    setDetails(null); setErr(null);
    ipc.getUserDetails(profileId, grantee).then(setDetails).catch((e) => setErr(errorMessage(e)));
    ipc.getDatabaseOverview(profileId).then((o) => setSchemas(o.schemas.map((s) => s.name))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, grantee, connectionName]);

  const grantedRoles = (details?.roles ?? []).filter(Boolean) as string[];
  const sysPrivs = (details?.systemPrivileges ?? []).filter(Boolean) as string[];
  const objPrivs = details?.objectPrivileges ?? [];
  const H = ({ children }: { children: React.ReactNode }) => <div className="mt-4 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:mt-0">{children}</div>;
  const selectCls = "h-7 min-w-0 rounded-md border border-border bg-editor px-1.5 text-[11.5px] outline-none";

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-l border-border bg-panel/40">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{grantee}</span>
        <span className="rounded bg-secondary px-1.5 py-px text-[9.5px] font-medium uppercase text-muted-foreground">{isRole ? "role" : "user"}</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {err ? <p className="text-[12px] text-destructive">{err}</p> : !details ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
        ) : (
          <>
            <H>Granted roles</H>
            {grantedRoles.length === 0 ? <p className="text-[11.5px] text-muted-foreground">None.</p> : null}
            {grantedRoles.map((r) => (
              <div key={r} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[12px] text-foreground hover:bg-secondary/50">
                <Shield className="h-3 w-3 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{r}</span>
                {canGrantRole ? <RowBtn title={`Revoke ${r}`} danger onClick={() => onAsk({ kind: "delete", title: `Revoke role ${r}`, now: `${grantee} has the ${r} role and its privileges.`, after: `${grantee} loses the ${r} role and everything it granted.`, recoverable: true, sql: [dbaSql.revokeRole(r, grantee)] })}><X className="h-3 w-3" /></RowBtn> : null}
              </div>
            ))}
            {canGrantRole ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <AppSelect value={roleToGrant} onChange={setRoleToGrant} placeholder="Grant a role…" className="min-w-0 flex-1" options={roles.filter((r) => !grantedRoles.includes(r) && r !== grantee).map((r) => ({ value: r, label: r }))} ariaLabel="Role to grant" />
                <label className="flex items-center gap-1 text-[10.5px] text-muted-foreground" title="Grantee may grant this role onward"><input type="checkbox" checked={adminOption} onChange={(e) => setAdminOption(e.target.checked)} className="h-3 w-3 accent-[color:var(--primary)]" /> admin</label>
                <button disabled={!roleToGrant} onClick={() => onAsk({ kind: "create", title: `Grant role ${roleToGrant}`, after: `${grantee} gains the ${roleToGrant} role${adminOption ? " and can grant it onward" : ""}.`, recoverable: true, sql: [dbaSql.grantRole(roleToGrant, grantee, adminOption)] })} className="h-7 rounded-md bg-primary px-2 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">Grant</button>
              </div>
            ) : null}

            <H>System privileges</H>
            {sysPrivs.length === 0 ? <p className="text-[11.5px] text-muted-foreground">None.</p> : null}
            {sysPrivs.map((p) => (
              <div key={p} className="flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[11px] text-foreground hover:bg-secondary/50">
                <span className="min-w-0 flex-1 truncate">{p}</span>
                {canGrantPriv && ALL_SYS_PRIVS.has(p) ? <RowBtn title={`Revoke ${p}`} danger onClick={() => onAsk({ kind: "delete", title: `Revoke ${p}`, after: `${grantee} can no longer ${p.toLowerCase()}.`, recoverable: true, sql: [dbaSql.revokeSysPriv(p, grantee)] })}><X className="h-3 w-3" /></RowBtn> : null}
              </div>
            ))}
            {canGrantPriv ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <AppSelect value={privToGrant} onChange={setPrivToGrant} placeholder="Grant a system privilege…" className="min-w-0 flex-1" groups={SYS_PRIVS.map((g) => ({ label: g.group, options: g.privs.filter((p) => !sysPrivs.includes(p)).map((p) => ({ value: p, label: p })) }))} ariaLabel="System privilege to grant" />
                <button disabled={!privToGrant} onClick={() => onAsk({ kind: "create", title: `Grant ${privToGrant}`, after: `${grantee} can now ${privToGrant.toLowerCase()}.`, recoverable: true, sql: [dbaSql.grantSysPriv(privToGrant, grantee)] })} className="h-7 rounded-md bg-primary px-2 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">Grant</button>
              </div>
            ) : null}

            <H>Object privileges</H>
            {objPrivs.length === 0 ? <p className="text-[11.5px] text-muted-foreground">None.</p> : null}
            {objPrivs.map((p, i) => {
              const ref = p.object ? `${ident(p.schema ?? "")}.${ident(p.object)}` : `SCHEMA ${ident(p.schema ?? "")}`;
              const where = `${p.schema}${p.object ? `.${p.object}` : " (schema)"}`;
              return (
                <div key={i} className="flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[11px] text-foreground hover:bg-secondary/50">
                  <span className="min-w-0 flex-1 truncate">{p.privilege} · {where}</span>
                  {canGrantObj && p.privilege ? <RowBtn title="Revoke" danger onClick={() => onAsk({ kind: "delete", title: `Revoke ${p.privilege} on ${where}`, after: `${grantee} can no longer ${p.privilege!.toLowerCase()} ${where}.`, recoverable: true, sql: [dbaSql.revokeObjPriv(p.privilege!, ref, grantee)] })}><X className="h-3 w-3" /></RowBtn> : null}
                </div>
              );
            })}
            {canGrantObj ? (
              <div className="mt-1.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <AppSelect value={objSchema} onChange={setObjSchema} placeholder="Schema…" className="min-w-0 flex-1" options={schemas.map((sc) => ({ value: sc, label: sc }))} ariaLabel="Schema" />
                  <input value={objName} onChange={(e) => setObjName(e.target.value.toUpperCase())} placeholder="table (blank = schema)" spellCheck={false} className={cn(selectCls, "flex-1 font-mono")} />
                </div>
                <div className="flex items-center gap-1.5">
                  <AppSelect value={objPriv} onChange={setObjPriv} className="min-w-0 flex-1" options={(objName ? OBJ_PRIVS_TABLE : OBJ_PRIVS_SCHEMA).map((p) => ({ value: p, label: p }))} ariaLabel="Object privilege" />
                  <button disabled={!objSchema} onClick={() => onAsk({ kind: "create", title: `Grant ${objPriv} on ${objSchema}${objName ? `.${objName}` : ""}`, after: `${grantee} can ${objPriv.toLowerCase()} ${objSchema}${objName ? `.${objName}` : " (whole schema)"}.`, recoverable: true, sql: [dbaSql.grantObjPriv(objPriv, objSchema, objName || null, grantee)] })} className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"><ChevronRight className="h-3 w-3" /> Grant</button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Grid({ columns, rows, actions }: { columns: string[]; rows: string[][]; actions?: (row: string[]) => React.ReactNode }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted-foreground">No rows.</p>;
  return (
    <table className="w-full border-collapse border border-border text-[12px]">
      <thead>
        <tr className="bg-secondary text-left">{columns.map((c) => <th key={c} className="border border-border px-3 py-1.5 font-medium text-foreground">{c}</th>)}</tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((r, i) => (
          <tr key={i} className="even:bg-secondary/30">
            {r.map((v, j) => <td key={j} className="max-w-[380px] truncate border border-border px-3 py-1 text-foreground/90">{v}</td>)}
            {actions ? <td className="border border-border px-2 py-1">{actions(r)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
