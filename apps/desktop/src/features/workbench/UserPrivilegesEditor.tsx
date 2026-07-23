import { useMemo, useState } from "react";
import { Code2, Loader2, Plus, RotateCcw, Save, ShieldOff, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dbaSql, ident, SYS_PRIVS, ALL_SYS_PRIVS, OBJ_PRIVS_SCHEMA, OBJ_PRIVS_TABLE } from "./dba-sql";

type ObjPriv = { schema: string | null; object: string | null; privilege: string | null };

/**
 * Edit a user's roles and system privileges in the Details tab — grant/revoke
 * staged locally, diffed to GRANT/REVOKE statements. Same two-button model as
 * the table editors: Review SQL (query tab) / Confirm & Save (direct, inline
 * error). Object privileges stay read-only here (they're per-object grants).
 */
export function UserPrivilegesEditor({
  user,
  roles,
  sysPrivs,
  objPrivs = [],
  availableRoles,
  onOpenSql,
  onApply,
  onDone,
}: {
  user: string;
  roles: string[];
  sysPrivs: string[];
  objPrivs?: ObjPriv[];
  /** All roles in the DB (null = still loading) — feeds the grant dropdown. */
  availableRoles?: string[] | null;
  onOpenSql?: (sql: string, title?: string) => void;
  onApply?: (statements: string[]) => Promise<{ ok: boolean; error?: string; failedSql?: string }>;
  onDone: () => void;
}) {
  const currentRoles = useMemo(() => roles.filter(Boolean), [roles]);
  const currentPrivs = useMemo(() => sysPrivs.filter(Boolean), [sysPrivs]);
  // Object privileges the user already holds (each row: schema, object, priv).
  const currentObj = useMemo(
    () => objPrivs.filter((o) => o.privilege && o.schema).map((o) => ({ schema: o.schema as string, object: o.object, privilege: o.privilege as string })),
    [objPrivs],
  );

  const [revokedRoles, setRevokedRoles] = useState<Set<string>>(new Set());
  const [addedRoles, setAddedRoles] = useState<string[]>([]);
  const [revokedPrivs, setRevokedPrivs] = useState<Set<string>>(new Set());
  const [addedPrivs, setAddedPrivs] = useState<string[]>([]);
  // Object privileges: revoke keyed on "priv@schema.object"; adds are staged rows.
  const [revokedObj, setRevokedObj] = useState<Set<string>>(new Set());
  const [addedObj, setAddedObj] = useState<{ schema: string; object: string; priv: string }[]>([]);
  const [objSchema, setObjSchema] = useState("");
  const [objObject, setObjObject] = useState("");
  const [objPriv, setObjPriv] = useState("");
  const [applyError, setApplyError] = useState<{ message: string; sql?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const objKey = (o: { schema: string; object: string | null; privilege: string }) => `${o.privilege}@${o.schema}.${o.object ?? ""}`;

  const heldPrivs = useMemo(() => new Set(currentPrivs.map((p) => p.toUpperCase())), [currentPrivs]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const n = new Set(set);
    n.has(key) ? n.delete(key) : n.add(key);
    setter(n);
  }

  const statements = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const r of revokedRoles) out.push(dbaSql.revokeRole(r, user) + ";");
    for (const r of addedRoles) out.push(dbaSql.grantRole(r, user, false) + ";");
    for (const p of revokedPrivs) if (ALL_SYS_PRIVS.has(p)) out.push(dbaSql.revokeSysPriv(p, user) + ";");
    for (const p of addedPrivs) if (ALL_SYS_PRIVS.has(p)) out.push(dbaSql.grantSysPriv(p, user) + ";");
    // Object privileges
    for (const o of currentObj) {
      if (revokedObj.has(objKey(o))) {
        const ref = o.object ? `${ident(o.schema)}.${ident(o.object)}` : `SCHEMA ${ident(o.schema)}`;
        out.push(dbaSql.revokeObjPriv(o.privilege, ref, user) + ";");
      }
    }
    for (const o of addedObj) out.push(dbaSql.grantObjPriv(o.priv, o.schema, o.object || null, user) + ";");
    return out;
  }, [revokedRoles, addedRoles, revokedPrivs, addedPrivs, revokedObj, addedObj, currentObj, user]);

  const dirty = statements.length > 0;

  function reset() {
    setRevokedRoles(new Set());
    setAddedRoles([]);
    setRevokedPrivs(new Set());
    setAddedPrivs([]);
    setRevokedObj(new Set());
    setAddedObj([]);
    setObjSchema(""); setObjObject(""); setObjPriv("");
    setApplyError(null);
  }

  async function save() {
    if (!onApply || !statements.length) return;
    setApplyError(null);
    setSaving(true);
    const r = await onApply(statements);
    setSaving(false);
    if (r?.ok) onDone();
    else setApplyError({ message: r?.error ?? "The change failed.", sql: r?.failedSql });
  }

  // Roles in the DB the user doesn't already have (and aren't staged yet).
  const grantableRoles = (availableRoles ?? []).filter(
    (r) => !currentRoles.some((x) => x.toUpperCase() === r.toUpperCase()) && !addedRoles.includes(r),
  );

  // System privileges available to add (curated list minus already-held/added).
  const addable = SYS_PRIVS.map((g) => ({
    group: g.group,
    privs: g.privs.filter((p) => !heldPrivs.has(p) && !addedPrivs.includes(p)),
  })).filter((g) => g.privs.length);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Editing access</span>
        <span className="font-mono text-[11px] text-muted-foreground">{user}</span>
        <button onClick={reset} disabled={!dirty} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Revert</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { if (statements.length && onOpenSql) onOpenSql(statements.join("\n"), `Access ${user}`); }} disabled={!dirty || saving || !onOpenSql} title="Open these changes as SQL in a new query tab" className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"><Code2 className="h-3.5 w-3.5" /> Review SQL</button>
          <button onClick={save} disabled={!dirty || saving || !onApply} title="Run these changes now" className="cta-glow flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Confirm &amp; Save</button>
          <button onClick={onDone} className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Done</button>
        </div>
      </div>

      {applyError ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2">
          <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-destructive">Change failed — your edits are kept. Fix and Save again, or use Review SQL.</p>
            <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{applyError.message}</p>
            {applyError.sql ? <p className="mt-1 break-all font-mono text-[10.5px] text-muted-foreground">{applyError.sql}</p> : null}
          </div>
          <button onClick={() => setApplyError(null)} aria-label="Dismiss" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Roles */}
        <section>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Granted roles</p>
          <div className="flex flex-wrap gap-1.5">
            {currentRoles.map((r) => {
              const off = revokedRoles.has(r);
              return (
                <button key={r} onClick={() => toggle(revokedRoles, setRevokedRoles, r)} title={off ? "Keep this role" : "Revoke this role"} className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]", off ? "border-destructive/40 text-muted-foreground line-through" : "border-border text-foreground hover:border-destructive/50")}>
                  {r} {off ? <Undo2 className="h-3 w-3" /> : <X className="h-3 w-3 text-muted-foreground" />}
                </button>
              );
            })}
            {addedRoles.map((r) => (
              <button key={r} onClick={() => setAddedRoles((a) => a.filter((x) => x !== r))} className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary" title="Remove (don't grant)">
                {r} <X className="h-3 w-3" />
              </button>
            ))}
            {!currentRoles.length && !addedRoles.length ? <span className="text-[12px] text-muted-foreground">No roles.</span> : null}
          </div>
          <div className="mt-2">
            <Select value="" onValueChange={(v) => { if (v) setAddedRoles((a) => [...a, v]); }} disabled={availableRoles !== null && grantableRoles.length === 0}>
              <SelectTrigger size="sm" className="h-7 w-64 text-[11px]">
                <SelectValue placeholder={availableRoles === null ? "Loading roles…" : grantableRoles.length ? "Grant a role…" : "No more roles to grant"} />
              </SelectTrigger>
              <SelectContent>
                {grantableRoles.map((r) => <SelectItem key={r} value={r} className="font-mono text-[11px]">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* System privileges */}
        <section>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">System privileges</p>
          <div className="flex flex-wrap gap-1.5">
            {currentPrivs.map((p) => {
              const off = revokedPrivs.has(p);
              return (
                <button key={p} onClick={() => toggle(revokedPrivs, setRevokedPrivs, p)} title={off ? "Keep this privilege" : "Revoke this privilege"} className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]", off ? "border-destructive/40 text-muted-foreground line-through" : "border-border text-foreground hover:border-destructive/50")}>
                  {p} {off ? <Undo2 className="h-3 w-3" /> : <X className="h-3 w-3 text-muted-foreground" />}
                </button>
              );
            })}
            {addedPrivs.map((p) => (
              <button key={p} onClick={() => setAddedPrivs((a) => a.filter((x) => x !== p))} className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary" title="Remove (don't grant)">
                {p} <X className="h-3 w-3" />
              </button>
            ))}
            {!currentPrivs.length && !addedPrivs.length ? <span className="text-[12px] text-muted-foreground">No system privileges.</span> : null}
          </div>
          {addable.length ? (
            <div className="mt-2">
              <Select value="" onValueChange={(v) => { if (v) setAddedPrivs((a) => [...a, v]); }}>
                <SelectTrigger size="sm" className="h-7 w-64 text-[11px]"><SelectValue placeholder="Grant a system privilege…" /></SelectTrigger>
                <SelectContent>
                  {addable.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.privs.map((p) => <SelectItem key={p} value={p} className="font-mono text-[11px]">{p}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </section>

        {/* Object privileges */}
        <section>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Object privileges</p>
          <div className="flex flex-wrap gap-1.5">
            {currentObj.map((o) => {
              const k = objKey(o);
              const off = revokedObj.has(k);
              const on = `${o.privilege} on ${o.schema}${o.object ? "." + o.object : ""}`;
              return (
                <button key={k} onClick={() => toggle(revokedObj, setRevokedObj, k)} title={off ? "Keep this grant" : "Revoke this grant"} className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]", off ? "border-destructive/40 text-muted-foreground line-through" : "border-border text-foreground hover:border-destructive/50")}>
                  {on} {off ? <Undo2 className="h-3 w-3" /> : <X className="h-3 w-3 text-muted-foreground" />}
                </button>
              );
            })}
            {addedObj.map((o, i) => (
              <button key={`${objKey({ schema: o.schema, object: o.object, privilege: o.priv })}-${i}`} onClick={() => setAddedObj((a) => a.filter((_, j) => j !== i))} className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary" title="Remove (don't grant)">
                {o.priv} on {o.schema}{o.object ? "." + o.object : ""} <X className="h-3 w-3" />
              </button>
            ))}
            {!currentObj.length && !addedObj.length ? <span className="text-[12px] text-muted-foreground">No object privileges.</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input value={objSchema} onChange={(e) => setObjSchema(e.target.value)} placeholder="SCHEMA" className="h-7 w-28 rounded-md border border-border bg-transparent px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/50" />
            <input value={objObject} onChange={(e) => setObjObject(e.target.value)} placeholder="TABLE (blank = whole schema)" className="h-7 w-52 rounded-md border border-border bg-transparent px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/50" />
            <Select value={objPriv} onValueChange={setObjPriv}>
              <SelectTrigger size="sm" className="h-7 w-36 text-[11px]"><SelectValue placeholder="Privilege…" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{objObject ? "Table / view" : "Schema"}</SelectLabel>
                  {(objObject ? OBJ_PRIVS_TABLE : OBJ_PRIVS_SCHEMA).map((p) => <SelectItem key={p} value={p} className="font-mono text-[11px]">{p}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <button
              onClick={() => {
                const sc = objSchema.trim().toUpperCase();
                if (!sc || !objPriv) return;
                setAddedObj((a) => [...a, { schema: sc, object: objObject.trim().toUpperCase(), priv: objPriv }]);
                setObjObject(""); setObjPriv("");
              }}
              disabled={!objSchema.trim() || !objPriv}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Grant
            </button>
          </div>
        </section>

        {dirty ? <p className="text-[11px] text-muted-foreground">{statements.length} statement{statements.length === 1 ? "" : "s"} pending — review or save.</p> : null}
      </div>
    </div>
  );
}
