import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeCtx } from "@/features/workbench/tree-model";

/** A form field in an object action dialog. */
export type ActionField = {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea" | "select" | "number";
  value?: string;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
};

/**
 * A CRUD/DDL action on a database object. Rendered as a **form** (when it has
 * fields) or a **confirmation** (when it doesn't) — never a raw SQL editor. The
 * generated SQL runs silently after the user saves/confirms.
 */
export type ObjectAction = {
  title: string;
  /** Primary button label, e.g. "Rename", "Drop", "Create". */
  verb: string;
  danger?: boolean;
  /** Extra explanation, especially the "cannot be undone" note for confirms. */
  message?: string;
  fields?: ActionField[];
  buildSql: (v: Record<string, string>) => string;
};

type Item =
  | { sep: true }
  | { label: string; kind: "run" | "gen" | "copy"; sql?: string; text?: string }
  | { label: string; kind: "action"; danger?: boolean; action: ObjectAction };

function q(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}
/** Escape a value for use inside a single-quoted SQL string literal. */
function lit(s: string): string {
  return (s ?? "").replace(/'/g, "''");
}

function label(schema: string | undefined, name: string): string {
  return schema ? `${schema}.${name}` : name;
}

/** Build the right-click menu for an object, based on its type. */
function itemsFor(ctx: NodeCtx, defaultSchema?: string): Item[] {
  const schema = ctx.schema ?? defaultSchema;
  switch (ctx.type) {
    case "table": {
      const t = q(schema, ctx.name);
      return [
        { label: "Open data", kind: "run", sql: `SELECT * FROM ${t} LIMIT 1000;` },
        { label: "Generate SELECT", kind: "gen", sql: `SELECT * FROM ${t};` },
        { label: "Generate INSERT", kind: "gen", sql: `INSERT INTO ${t} (/* columns */) VALUES (/* values */);` },
        { label: "Generate UPDATE", kind: "gen", sql: `UPDATE ${t} SET /* col = value */ WHERE /* condition */;` },
        { label: "Generate DELETE", kind: "gen", sql: `DELETE FROM ${t} WHERE /* condition */;` },
        { sep: true },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename table ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `RENAME TABLE ${t} TO ${q(schema, v.name)};`,
          },
        },
        {
          label: "Comment…",
          kind: "action",
          action: {
            title: `Comment on ${ctx.name}`,
            verb: "Save",
            fields: [{ key: "comment", label: "Comment", type: "textarea", placeholder: "Describe this table…" }],
            buildSql: (v) => `COMMENT ON TABLE ${t} IS '${lit(v.comment)}';`,
          },
        },
        { sep: true },
        {
          label: "Truncate…",
          kind: "action",
          danger: true,
          action: {
            title: `Truncate ${ctx.name}?`,
            verb: "Truncate",
            danger: true,
            message: `Every row in ${label(schema, ctx.name)} will be permanently deleted. The table structure is kept. This cannot be undone.`,
            buildSql: () => `TRUNCATE TABLE ${t};`,
          },
        },
        {
          label: "Drop…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop table ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The table ${label(schema, ctx.name)} and all of its data will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP TABLE ${t};`,
          },
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
        { label: "Copy path", kind: "copy", text: label(schema, ctx.name) },
      ];
    }
    case "view": {
      const v = q(schema, ctx.name);
      return [
        { label: "Open data", kind: "run", sql: `SELECT * FROM ${v} LIMIT 1000;` },
        { label: "Generate SELECT", kind: "gen", sql: `SELECT * FROM ${v};` },
        { sep: true },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename view ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (val) => `RENAME VIEW ${v} TO ${q(schema, val.name)};`,
          },
        },
        {
          label: "Comment…",
          kind: "action",
          action: {
            title: `Comment on ${ctx.name}`,
            verb: "Save",
            fields: [{ key: "comment", label: "Comment", type: "textarea" }],
            buildSql: (val) => `COMMENT ON VIEW ${v} IS '${lit(val.comment)}';`,
          },
        },
        {
          label: "Drop…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop view ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The view ${label(schema, ctx.name)} will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP VIEW ${v};`,
          },
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "schema":
    case "virtual-schema": {
      const s = q(undefined, ctx.name);
      const virtual = ctx.type === "virtual-schema";
      return [
        { label: "Set as default schema", kind: "run", sql: `OPEN SCHEMA ${s};` },
        ...(virtual
          ? ([
              {
                label: "Refresh…",
                kind: "action",
                action: {
                  title: `Refresh virtual schema ${ctx.name}`,
                  verb: "Refresh",
                  message: "Re-read the remote metadata for this virtual schema.",
                  buildSql: () => `ALTER VIRTUAL SCHEMA ${s} REFRESH;`,
                },
              },
            ] as Item[])
          : ([
              {
                // Open an editable CREATE TABLE template in a new query tab (not a
                // dialog) so it can be tweaked and run like any other statement.
                label: "New table…",
                kind: "gen",
                sql:
                  `CREATE TABLE ${q(ctx.name, "MY_TABLE")} (\n` +
                  `  ID           DECIMAL(18,0) IDENTITY,\n` +
                  `  NAME         VARCHAR(200),\n` +
                  `  AMOUNT       DECIMAL(18,2),\n` +
                  `  CREATED_AT   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n` +
                  `  PRIMARY KEY (ID)\n` +
                  `);`,
              },
            ] as Item[])),
        { sep: true },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename schema ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `RENAME SCHEMA ${s} TO ${q(undefined, v.name)};`,
          },
        },
        {
          label: "Comment…",
          kind: "action",
          action: {
            title: `Comment on ${ctx.name}`,
            verb: "Save",
            fields: [{ key: "comment", label: "Comment", type: "textarea" }],
            buildSql: (v) => `COMMENT ON SCHEMA ${s} IS '${lit(v.comment)}';`,
          },
        },
        {
          label: "Drop…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop schema ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The ${virtual ? "virtual " : ""}schema ${ctx.name} and everything inside it will be permanently removed (CASCADE). This cannot be undone.`,
            buildSql: () => `DROP ${virtual ? "VIRTUAL " : ""}SCHEMA ${s} CASCADE;`,
          },
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "column": {
      const t = q(schema, ctx.table ?? "");
      const c = `"${ctx.name}"`;
      return [
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename column ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `ALTER TABLE ${t} RENAME COLUMN ${c} TO "${v.name}";`,
          },
        },
        {
          label: "Change type…",
          kind: "action",
          action: {
            title: `Change type of ${ctx.name}`,
            verb: "Apply",
            fields: [{ key: "type", label: "New data type", value: "VARCHAR(200)", required: true }],
            buildSql: (v) => `ALTER TABLE ${t} MODIFY COLUMN ${c} ${v.type};`,
          },
        },
        {
          label: "Comment…",
          kind: "action",
          action: {
            title: `Comment on ${ctx.name}`,
            verb: "Save",
            fields: [{ key: "comment", label: "Comment", type: "textarea" }],
            buildSql: (v) => `COMMENT ON COLUMN ${t}.${c} IS '${lit(v.comment)}';`,
          },
        },
        {
          label: "Drop column…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop column ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The column ${ctx.name} and its data will be permanently removed. This cannot be undone.`,
            buildSql: () => `ALTER TABLE ${t} DROP COLUMN ${c};`,
          },
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "user": {
      const u = q(undefined, ctx.name);
      return [
        {
          label: "Change password…",
          kind: "action",
          action: {
            title: `Change password for ${ctx.name}`,
            verb: "Update",
            fields: [{ key: "pw", label: "New password", type: "password", required: true }],
            buildSql: (v) => `ALTER USER ${u} IDENTIFIED BY "${v.pw}";`,
          },
        },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename user ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `RENAME USER ${u} TO ${q(undefined, v.name)};`,
          },
        },
        {
          label: "Set consumer group…",
          kind: "action",
          action: {
            title: `Consumer group for ${ctx.name}`,
            verb: "Apply",
            fields: [
              {
                key: "grp",
                label: "Consumer group",
                type: "select",
                value: "MEDIUM",
                options: [
                  { value: "LOW", label: "LOW" },
                  { value: "MEDIUM", label: "MEDIUM" },
                  { value: "HIGH", label: "HIGH" },
                ],
              },
            ],
            buildSql: (v) => `ALTER USER ${u} SET CONSUMER_GROUP = ${v.grp};`,
          },
        },
        {
          label: "Drop user…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop user ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The user ${ctx.name} and everything they own will be removed (CASCADE). This cannot be undone.`,
            buildSql: () => `DROP USER ${u} CASCADE;`,
          },
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "role": {
      const r = q(undefined, ctx.name);
      return [
        {
          label: "Grant role…",
          kind: "action",
          action: {
            title: `Grant ${ctx.name}`,
            verb: "Grant",
            fields: [{ key: "grantee", label: "Grant to (user or role)", required: true }],
            buildSql: (v) => `GRANT ${r} TO ${q(undefined, v.grantee)};`,
          },
        },
        {
          label: "Drop role…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop role ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The role ${ctx.name} will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP ROLE ${r};`,
          },
        },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "connection": {
      const cn = q(undefined, ctx.name);
      return [
        {
          label: "Alter connection…",
          kind: "action",
          action: {
            title: `Alter connection ${ctx.name}`,
            verb: "Save",
            fields: [
              { key: "to", label: "Target (host:port / URL)", required: true },
              { key: "user", label: "User", placeholder: "optional" },
              { key: "pw", label: "Password", type: "password", placeholder: "optional" },
            ],
            buildSql: (v) =>
              `ALTER CONNECTION ${cn} TO '${lit(v.to)}'${v.user ? ` USER '${lit(v.user)}' IDENTIFIED BY '${lit(v.pw)}'` : ""};`,
          },
        },
        {
          label: "Drop connection…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop connection ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The connection ${ctx.name} will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP CONNECTION ${cn};`,
          },
        },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "script": {
      const s = q(schema, ctx.name);
      return [
        { label: "Execute", kind: "run", sql: `EXECUTE SCRIPT ${s};` },
        { label: "Generate call", kind: "gen", sql: `EXECUTE SCRIPT ${s}();` },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename script ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `RENAME SCRIPT ${s} TO ${q(schema, v.name)};`,
          },
        },
        {
          label: "Drop…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop script ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The script ${label(schema, ctx.name)} will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP SCRIPT ${s};`,
          },
        },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "function": {
      const f = q(schema, ctx.name);
      return [
        { label: "Generate call", kind: "gen", sql: `SELECT ${f}();` },
        {
          label: "Rename…",
          kind: "action",
          action: {
            title: `Rename function ${ctx.name}`,
            verb: "Rename",
            fields: [{ key: "name", label: "New name", value: ctx.name, required: true }],
            buildSql: (v) => `RENAME FUNCTION ${f} TO ${q(schema, v.name)};`,
          },
        },
        {
          label: "Drop…",
          kind: "action",
          danger: true,
          action: {
            title: `Drop function ${ctx.name}?`,
            verb: "Drop",
            danger: true,
            message: `The function ${label(schema, ctx.name)} will be permanently removed. This cannot be undone.`,
            buildSql: () => `DROP FUNCTION ${f};`,
          },
        },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "new-schema":
      return [
        {
          label: "New schema…",
          kind: "action",
          action: {
            title: "Create schema",
            verb: "Create",
            fields: [{ key: "name", label: "Schema name", value: "NEW_SCHEMA", required: true }],
            buildSql: (v) => `CREATE SCHEMA ${q(undefined, v.name)};`,
          },
        },
      ];
    case "new-user":
      return [
        {
          label: "New user…",
          kind: "action",
          action: {
            title: "Create user",
            verb: "Create",
            fields: [
              { key: "name", label: "User name", value: "NEW_USER", required: true },
              { key: "pw", label: "Password", type: "password", required: true },
            ],
            buildSql: (v) => `CREATE USER ${q(undefined, v.name)} IDENTIFIED BY "${v.pw}";`,
          },
        },
      ];
    case "new-role":
      return [
        {
          label: "New role…",
          kind: "action",
          action: {
            title: "Create role",
            verb: "Create",
            fields: [{ key: "name", label: "Role name", value: "NEW_ROLE", required: true }],
            buildSql: (v) => `CREATE ROLE ${q(undefined, v.name)};`,
          },
        },
      ];
    case "new-connection":
      return [
        {
          label: "New connection…",
          kind: "action",
          action: {
            title: "Create connection",
            verb: "Create",
            fields: [
              { key: "name", label: "Connection name", value: "NEW_CONNECTION", required: true },
              { key: "to", label: "Target (host:port / URL)", required: true },
              { key: "user", label: "User", placeholder: "optional" },
              { key: "pw", label: "Password", type: "password", placeholder: "optional" },
            ],
            buildSql: (v) =>
              `CREATE CONNECTION ${q(undefined, v.name)} TO '${lit(v.to)}'${v.user ? ` USER '${lit(v.user)}' IDENTIFIED BY '${lit(v.pw)}'` : ""};`,
          },
        },
      ];
    case "session":
      return [
        {
          label: "Kill session…",
          kind: "action",
          danger: true,
          action: {
            title: `Kill session ${ctx.name}?`,
            verb: "Kill",
            danger: true,
            message: `Session ${ctx.name} will be terminated. Any in-flight statement is rolled back.`,
            buildSql: () => `KILL SESSION ${ctx.name};`,
          },
        },
        { label: "Copy session id", kind: "copy", text: ctx.name },
      ];
    default:
      return [{ label: "Copy name", kind: "copy", text: ctx.name }];
  }
}

export function ObjectContextMenu({
  ctx,
  x,
  y,
  defaultSchema,
  onClose,
  onEditorSql,
  onAction,
  onDetails,
  onFavorite,
}: {
  ctx: NodeCtx;
  x: number;
  y: number;
  defaultSchema?: string;
  onClose: () => void;
  /** Put SQL into a new query tab; run immediately when `run` is true. */
  onEditorSql: (sql: string, run: boolean) => void;
  /** Open the form/confirmation dialog for a CRUD/DDL action. */
  onAction: (action: ObjectAction) => void;
  /** Open the object detail tab (schema/table/view). */
  onDetails?: () => void;
  /** Add this object to Favorites. */
  onFavorite?: () => void;
}) {
  const items = itemsFor(ctx, defaultSchema);
  const canDetail =
    onDetails &&
    (ctx.type === "schema" || ctx.type === "virtual-schema" || ctx.type === "table" || ctx.type === "view" || ctx.type === "user");
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  // Keep the menu on-screen.
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - items.length * 30 - 16);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{ left, top }}
      className="fixed z-[60] min-w-[220px] rounded-lg border border-border bg-popover py-1 shadow-2xl"
    >
      <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {ctx.type.replace("-", " ")} · {ctx.name}
      </div>
      {canDetail ? (
        <>
          <button
            onClick={() => {
              onDetails?.();
              onClose();
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] font-medium text-foreground hover:bg-secondary"
          >
            Open details
          </button>
          <div className="my-1 h-px bg-border" />
        </>
      ) : null}
      {items.map((it, i) =>
        "sep" in it ? (
          <div key={i} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            onClick={() => {
              if (it.kind === "copy") navigator.clipboard?.writeText(it.text ?? "");
              else if (it.kind === "action") onAction(it.action);
              else onEditorSql(it.sql ?? "", it.kind === "run");
              onClose();
            }}
            className={cn(
              "flex w-full items-center px-3 py-1.5 text-left text-[12.5px]",
              "danger" in it && it.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary",
            )}
          >
            {it.label}
          </button>
        ),
      )}
      {onFavorite ? (
        <>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => {
              onFavorite();
              onClose();
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] text-foreground hover:bg-secondary"
          >
            ★ Add to Favorites
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * Form (for edits/creates) or confirmation (for destructive ops) for an object
 * action. No SQL is shown — the user fills fields or confirms, and the caller
 * runs the generated statement.
 */
export function ObjectActionDialog({
  action,
  busy,
  onSubmit,
  onClose,
}: {
  action: ObjectAction;
  busy: boolean;
  onSubmit: (sql: string) => void;
  onClose: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries((action.fields ?? []).map((f) => [f.key, f.value ?? ""])),
  );
  const danger = Boolean(action.danger);
  const missing = (action.fields ?? []).some((f) => f.required && !vals[f.key]?.trim());

  const submit = () => {
    if (missing || busy) return;
    onSubmit(action.buildSql(vals));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {danger ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> : null}
          <span className="flex-1 text-[13px] font-semibold text-foreground">{action.title}</span>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-4 [scrollbar-width:thin]">
          {action.message ? (
            <p className={cn("text-[12px] leading-relaxed", danger ? "text-destructive" : "text-muted-foreground")}>{action.message}</p>
          ) : null}
          {(action.fields ?? []).map((f) => (
            <label key={f.key} className="block text-[11px] text-muted-foreground">
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  value={vals[f.key] ?? ""}
                  placeholder={f.placeholder}
                  rows={4}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-0.5 w-full resize-none rounded-md border border-border bg-editor p-2 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/50 [scrollbar-width:thin]"
                />
              ) : f.type === "select" ? (
                <select
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 text-[12.5px] text-foreground outline-none focus:border-primary/50"
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                  value={vals[f.key] ?? ""}
                  placeholder={f.placeholder}
                  autoFocus={f.key === (action.fields ?? [])[0]?.key}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && f.type !== "textarea") submit();
                  }}
                  className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 text-[12.5px] text-foreground outline-none focus:border-primary/50"
                />
              )}
              {f.help ? <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">{f.help}</span> : null}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <button onClick={onClose} className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || missing}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50",
              danger ? "bg-destructive hover:bg-destructive/85" : "bg-primary hover:bg-primary/85",
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {action.verb}
          </button>
        </div>
      </div>
    </div>
  );
}
