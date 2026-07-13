import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeCtx } from "@/features/workbench/tree-model";

type Item =
  | { sep: true }
  | { label: string; kind: "run" | "gen" | "ddl" | "copy"; sql?: string; text?: string; danger?: boolean };

function q(schema: string | undefined, name: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
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
        { label: "Rename…", kind: "ddl", sql: `RENAME TABLE ${t} TO ${q(schema, "NEW_NAME")};` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON TABLE ${t} IS '';` },
        { sep: true },
        { label: "Truncate…", kind: "ddl", danger: true, sql: `TRUNCATE TABLE ${t};` },
        { label: "Drop…", kind: "ddl", danger: true, sql: `DROP TABLE ${t};` },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
        { label: "Copy path", kind: "copy", text: schema ? `${schema}.${ctx.name}` : ctx.name },
      ];
    }
    case "view": {
      const v = q(schema, ctx.name);
      return [
        { label: "Open data", kind: "run", sql: `SELECT * FROM ${v} LIMIT 1000;` },
        { label: "Generate SELECT", kind: "gen", sql: `SELECT * FROM ${v};` },
        { sep: true },
        { label: "Rename…", kind: "ddl", sql: `RENAME VIEW ${v} TO ${q(schema, "NEW_NAME")};` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON VIEW ${v} IS '';` },
        { label: "Drop…", kind: "ddl", danger: true, sql: `DROP VIEW ${v};` },
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
          ? [{ label: "Refresh…", kind: "ddl" as const, sql: `ALTER VIRTUAL SCHEMA ${s} REFRESH;` }]
          : [{ label: "New table…", kind: "gen" as const, sql: `CREATE TABLE ${q(ctx.name, "MY_TABLE")} (\n  ID DECIMAL(18,0),\n  NAME VARCHAR(200)\n);` }]),
        { sep: true },
        { label: "Rename…", kind: "ddl", sql: `RENAME SCHEMA ${s} TO ${q(undefined, "NEW_NAME")};` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON SCHEMA ${s} IS '';` },
        {
          label: "Drop…",
          kind: "ddl",
          danger: true,
          sql: `DROP ${virtual ? "VIRTUAL " : ""}SCHEMA ${s} CASCADE;`,
        },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "column": {
      const t = q(schema, ctx.table ?? "");
      const c = `"${ctx.name}"`;
      return [
        { label: "Rename…", kind: "ddl", sql: `ALTER TABLE ${t} RENAME COLUMN ${c} TO "NEW_NAME";` },
        { label: "Change type…", kind: "ddl", sql: `ALTER TABLE ${t} MODIFY COLUMN ${c} VARCHAR(200);` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON COLUMN ${t}.${c} IS '';` },
        { label: "Drop column…", kind: "ddl", danger: true, sql: `ALTER TABLE ${t} DROP COLUMN ${c};` },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "user": {
      const u = q(undefined, ctx.name);
      return [
        { label: "Alter password…", kind: "ddl", sql: `ALTER USER ${u} IDENTIFIED BY "new_password";` },
        { label: "Rename…", kind: "ddl", sql: `RENAME USER ${u} TO ${q(undefined, "NEW_NAME")};` },
        { label: "Set consumer group…", kind: "ddl", sql: `ALTER USER ${u} SET CONSUMER_GROUP = MEDIUM;` },
        { label: "Drop user…", kind: "ddl", danger: true, sql: `DROP USER ${u} CASCADE;` },
        { sep: true },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "role": {
      const r = q(undefined, ctx.name);
      return [
        { label: "Grant role…", kind: "ddl", sql: `GRANT ${r} TO ${q(undefined, "SOME_USER")};` },
        { label: "Drop role…", kind: "ddl", danger: true, sql: `DROP ROLE ${r};` },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "connection": {
      const c = q(undefined, ctx.name);
      return [
        { label: "Alter connection…", kind: "ddl", sql: `ALTER CONNECTION ${c} TO 'host:port' USER 'u' IDENTIFIED BY 'pw';` },
        { label: "Drop connection…", kind: "ddl", danger: true, sql: `DROP CONNECTION ${c};` },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "script": {
      const s = q(schema, ctx.name);
      return [
        { label: "Execute", kind: "run", sql: `EXECUTE SCRIPT ${s};` },
        { label: "Generate call", kind: "gen", sql: `EXECUTE SCRIPT ${s}();` },
        { label: "Rename…", kind: "ddl", sql: `RENAME SCRIPT ${s} TO ${q(schema, "NEW_NAME")};` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON SCRIPT ${s} IS '';` },
        { label: "Drop…", kind: "ddl", danger: true, sql: `DROP SCRIPT ${s};` },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "function": {
      const f = q(schema, ctx.name);
      return [
        { label: "Generate call", kind: "gen", sql: `SELECT ${f}();` },
        { label: "Rename…", kind: "ddl", sql: `RENAME FUNCTION ${f} TO ${q(schema, "NEW_NAME")};` },
        { label: "Comment…", kind: "ddl", sql: `COMMENT ON FUNCTION ${f} IS '';` },
        { label: "Drop…", kind: "ddl", danger: true, sql: `DROP FUNCTION ${f};` },
        { label: "Copy name", kind: "copy", text: ctx.name },
      ];
    }
    case "new-schema":
      return [{ label: "New schema…", kind: "ddl", sql: `CREATE SCHEMA "NEW_SCHEMA";` }];
    case "new-user":
      return [{ label: "New user…", kind: "ddl", sql: `CREATE USER "NEW_USER" IDENTIFIED BY "change_me";` }];
    case "new-role":
      return [{ label: "New role…", kind: "ddl", sql: `CREATE ROLE "NEW_ROLE";` }];
    case "new-connection":
      return [
        {
          label: "New connection…",
          kind: "ddl",
          sql: `CREATE CONNECTION "NEW_CONNECTION" TO 'host:port' USER 'user' IDENTIFIED BY 'password';`,
        },
      ];
    case "session":
      return [
        { label: "Kill session…", kind: "ddl", danger: true, sql: `KILL SESSION ${ctx.name};` },
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
  onDdl,
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
  /** Open the review dialog for a DDL/DCL statement. */
  onDdl: (title: string, sql: string) => void;
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
              else if (it.kind === "ddl") onDdl(it.label.replace("…", ""), it.sql ?? "");
              else onEditorSql(it.sql ?? "", it.kind === "run");
              onClose();
            }}
            className={cn(
              "flex w-full items-center px-3 py-1.5 text-left text-[12.5px]",
              it.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary",
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

/** Review a generated DDL/DCL statement, edit it, then run it. */
export function SqlReviewDialog({
  title,
  sql,
  busy,
  onRun,
  onClose,
}: {
  title: string;
  sql: string;
  busy: boolean;
  onRun: (finalSql: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(sql);
  const danger = /^\s*(drop|truncate|kill|delete)\b/i.test(text);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 text-[13px] font-semibold text-foreground">{title}</span>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 pt-3 text-[12px] text-muted-foreground">Review and edit the statement, then run it. This is executed against your connection.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="m-4 min-h-[130px] flex-1 resize-none rounded-lg border border-border bg-editor p-3 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/50 [scrollbar-width:thin]"
        />
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          {danger ? <span className="flex-1 text-[11px] text-destructive">This is a destructive statement.</span> : <span className="flex-1" />}
          <button onClick={onClose} className="h-8 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={() => onRun(text)}
            disabled={busy || !text.trim()}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50",
              danger ? "bg-destructive hover:bg-destructive/85" : "bg-primary hover:bg-primary/85",
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : danger ? <Check className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
