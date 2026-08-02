import { useEffect, useRef } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeCtx } from "@/features/workbench/tree-model";

/**
 * A destructive/DDL action rendered as a **confirmation** (never a form or a
 * raw SQL editor). Creates and edits generate editable SQL via `kind: "gen"`;
 * only irreversible operations (Drop, Kill, …) keep this confirm step, after
 * which the generated SQL runs.
 */
export type ObjectAction = {
  title: string;
  /** Primary button label, e.g. "Drop", "Kill". */
  verb: string;
  danger?: boolean;
  /** Explanation, especially the "cannot be undone" note. */
  message?: string;
  buildSql: () => string;
};

type Item =
  | { sep: true }
  | { label: string; kind: "run" | "gen" | "copy"; sql?: string; text?: string }
  | { label: string; kind: "nav"; navTab: string; navEdit?: boolean }
  | { label: string; kind: "action"; danger?: boolean; action: ObjectAction };

function q(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
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
        // All editing happens in the Details tab — never a dialog.
        { label: "Edit properties (rename, comment)…", kind: "nav", navTab: "info", navEdit: true },
        { label: "Edit structure (columns, types)…", kind: "nav", navTab: "columns", navEdit: true },
        { label: "Edit keys & constraints…", kind: "nav", navTab: "keys", navEdit: true },
        { sep: true },
        // Destructive ops open as reviewable SQL in a query tab (no dialog).
        { label: "Truncate — generate SQL", kind: "gen", sql: `TRUNCATE TABLE ${t};` },
        { label: "Drop — generate SQL", kind: "gen", sql: `DROP TABLE ${t};` },
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
        // Editing opens as reviewable SQL in a query tab (no dialog).
        { label: "Rename — generate SQL", kind: "gen", sql: `RENAME VIEW ${v} TO ${q(schema, ctx.name + "_NEW")};` },
        { label: "Comment — generate SQL", kind: "gen", sql: `COMMENT ON VIEW ${v} IS '/* description */';` },
        { label: "Drop — generate SQL", kind: "gen", sql: `DROP VIEW ${v};` },
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
              { label: "Refresh metadata", kind: "run", sql: `ALTER VIRTUAL SCHEMA ${s} REFRESH;` },
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
        { label: "Rename — generate SQL", kind: "gen", sql: `RENAME SCHEMA ${s} TO ${q(undefined, ctx.name + "_NEW")};` },
        { label: "Comment — generate SQL", kind: "gen", sql: `COMMENT ON SCHEMA ${s} IS '/* description */';` },
        {
          // Destructive → keep the confirmation model.
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
        // Column edits live in the table's Details → Columns editor; here we
        // only generate SQL (no dialog).
        { label: "Rename — generate SQL", kind: "gen", sql: `ALTER TABLE ${t} RENAME COLUMN ${c} TO "${ctx.name}_NEW";` },
        { label: "Change type — generate SQL", kind: "gen", sql: `ALTER TABLE ${t} MODIFY COLUMN ${c} VARCHAR(200);` },
        { label: "Comment — generate SQL", kind: "gen", sql: `COMMENT ON COLUMN ${t}.${c} IS '/* description */';` },
        {
          // Destructive → keep the confirmation model.
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
        // Roles & privileges are managed in the user's Details tab.
        { label: "Edit roles & privileges…", kind: "nav", navTab: "roles", navEdit: true },
        { sep: true },
        { label: "Change password — generate SQL", kind: "gen", sql: `ALTER USER ${u} IDENTIFIED BY "new_password";` },
        { label: "Rename — generate SQL", kind: "gen", sql: `RENAME USER ${u} TO ${q(undefined, ctx.name + "_NEW")};` },
        { label: "Set consumer group — generate SQL", kind: "gen", sql: `ALTER USER ${u} SET CONSUMER_GROUP = MEDIUM;` },
        {
          // Destructive → keep the confirmation model.
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
        { label: "Grant to… — generate SQL", kind: "gen", sql: `GRANT ${r} TO GRANTEE_NAME;` },
        {
          // Destructive → keep the confirmation model.
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
        { label: "Alter — generate SQL", kind: "gen", sql: `ALTER CONNECTION ${cn} TO 'host:port' USER 'user' IDENTIFIED BY 'password';` },
        {
          // Destructive → keep the confirmation model.
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
        { label: "Rename — generate SQL", kind: "gen", sql: `RENAME SCRIPT ${s} TO ${q(schema, ctx.name + "_NEW")};` },
        {
          // Destructive → keep the confirmation model.
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
        { label: "Rename — generate SQL", kind: "gen", sql: `RENAME FUNCTION ${f} TO ${q(schema, ctx.name + "_NEW")};` },
        {
          // Destructive → keep the confirmation model.
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
    // Create actions generate editable SQL in the editor (inspect-before-run) —
    // the same pattern as every other operation here — instead of a modal form.
    case "new-schema":
      return [{ label: "New schema — generate SQL", kind: "gen", sql: `CREATE SCHEMA NEW_SCHEMA;` }];
    case "new-user":
      return [{ label: "New user — generate SQL", kind: "gen", sql: `CREATE USER NEW_USER IDENTIFIED BY "password";` }];
    case "new-role":
      return [{ label: "New role — generate SQL", kind: "gen", sql: `CREATE ROLE NEW_ROLE;` }];
    case "new-connection":
      return [
        {
          label: "New connection — generate SQL",
          kind: "gen",
          sql: `CREATE CONNECTION NEW_CONNECTION TO 'host:port' USER 'user' IDENTIFIED BY 'password';`,
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
  onEditInDetails,
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
  /** Open the Details tab at a sub-tab in edit mode (table editing lives there). */
  onEditInDetails?: (tab: string, edit?: boolean) => void;
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
              if (it.kind === "copy") {
                void navigator.clipboard?.writeText(it.text ?? "").then(() =>
                  window.dispatchEvent(new CustomEvent("studio:notice", { detail: { kind: "success", title: "Copied to clipboard" } })),
                );
              }
              else if (it.kind === "action") onAction(it.action);
              else if (it.kind === "nav") onEditInDetails?.(it.navTab, it.navEdit);
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
 * Confirmation for a destructive/DDL action. No form and no SQL editor — the
 * user confirms and the caller runs the generated statement. (Creates/edits use
 * `kind: "gen"` and never reach here.)
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
  const danger = Boolean(action.danger);
  const submit = () => {
    if (busy) return;
    onSubmit(action.buildSql());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {danger ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> : null}
          <span className="flex-1 text-[13px] font-semibold text-foreground">{action.title}</span>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {action.message ? (
          <div className="p-4">
            <p className={cn("text-[12px] leading-relaxed", danger ? "text-destructive" : "text-muted-foreground")}>{action.message}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <button onClick={onClose} className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
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
