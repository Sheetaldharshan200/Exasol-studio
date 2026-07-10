import { ipc } from "@/lib/ipc";
import { NODE_ICON, scriptKind, type NodeKind } from "@/features/workbench/icons";

export type TreeNode = {
  id: string;
  label: string;
  kind: NodeKind;
  /** Right-aligned muted metadata (e.g. a column's data type). */
  meta?: string;
  /** Small pill (e.g. script language, "virtual", "disabled"). */
  badge?: string;
  /** Whether an expand chevron shows even before children are loaded. */
  expandable: boolean;
  /** Lazy children loader; resolved once and cached by the tree. */
  load?: () => Promise<TreeNode[]>;
  /** A runnable object (table/view) → double-click builds a SELECT. */
  selectable?: { schema: string; name: string };
};

export const iconFor = (kind: NodeKind) => NODE_ICON[kind];

/** Root of the live tree: server node with schemas, system schemas, and DBA. */
export function buildRoot(profileId: string, serverLabel: string): TreeNode {
  return {
    id: "server",
    label: serverLabel,
    kind: "server",
    expandable: true,
    load: async () => [
      schemasFolder(profileId),
      systemSchemasFolder(profileId),
      dbaFolder(profileId),
    ],
  };
}

/**
 * Top-level folders for one connection (Schemas / System Schemas / DBA),
 * rendered directly under a connection header instead of a wrapper "server"
 * node so several connections can stack in the navigator.
 */
export function buildConnectionNodes(profileId: string): TreeNode[] {
  return [
    schemasFolder(profileId),
    systemSchemasFolder(profileId),
    dbaFolder(profileId),
  ];
}

function schemasFolder(profileId: string): TreeNode {
  return {
    id: "schemas",
    label: "Schemas",
    kind: "schemas-folder",
    expandable: true,
    load: async () => {
      const overview = await ipc.getDatabaseOverview(profileId);
      return overview.schemas.map((schema) => ({
        id: `schema:${schema.name}`,
        label: schema.name,
        kind: schema.isVirtual ? "virtual-schema" : "schema",
        badge: schema.isVirtual ? "virtual" : undefined,
        expandable: true,
        load: () => schemaChildren(profileId, schema.name),
      }));
    },
  };
}

async function schemaChildren(profileId: string, schema: string): Promise<TreeNode[]> {
  const objects = await ipc.listSchemaObjects(profileId, schema);
  return [
    {
      id: `${schema}:tables`,
      label: "Tables",
      kind: "tables-folder",
      badge: objects.tables.length ? String(objects.tables.length) : undefined,
      expandable: objects.tables.length > 0,
      load: async () =>
        objects.tables.map((table) => tableNode(profileId, schema, table.name)),
    },
    {
      id: `${schema}:views`,
      label: "Views",
      kind: "views-folder",
      badge: objects.views.length ? String(objects.views.length) : undefined,
      expandable: objects.views.length > 0,
      load: async () =>
        objects.views.map((view) => ({
          id: `${schema}:view:${view.name}`,
          label: view.name,
          kind: "view",
          expandable: false,
          selectable: { schema, name: view.name },
        })),
    },
    {
      id: `${schema}:functions`,
      label: "Functions",
      kind: "functions-folder",
      badge: objects.functions.length ? String(objects.functions.length) : undefined,
      expandable: objects.functions.length > 0,
      load: async () =>
        objects.functions.map((fn) => ({
          id: `${schema}:fn:${fn.name}`,
          label: fn.name,
          kind: "function",
          expandable: false,
        })),
    },
    {
      id: `${schema}:scripts`,
      label: "Scripts",
      kind: "scripts-folder",
      badge: objects.scripts.length ? String(objects.scripts.length) : undefined,
      expandable: objects.scripts.length > 0,
      load: async () =>
        objects.scripts.map((script) => ({
          id: `${schema}:script:${script.name}`,
          label: script.name,
          kind: scriptKind(script.scriptType),
          badge: script.language ?? undefined,
          expandable: false,
        })),
    },
  ];
}

function tableNode(profileId: string, schema: string, table: string): TreeNode {
  return {
    id: `${schema}:table:${table}`,
    label: table,
    kind: "table",
    expandable: true,
    selectable: { schema, name: table },
    load: async () => {
      const details = await ipc.getTableDetails(profileId, schema, table);
      const pkColumns = new Set(
        details.constraints
          .filter((c) => c.constraintType === "PRIMARY KEY")
          .flatMap((c) => c.columns.map((col) => col.column)),
      );
      return [
        {
          id: `${schema}:${table}:columns`,
          label: "Columns",
          kind: "columns-folder",
          badge: String(details.columns.length),
          expandable: details.columns.length > 0,
          load: async () =>
            details.columns.map((col) => ({
              id: `${schema}:${table}:col:${col.name}`,
              label: col.name,
              kind: pkColumns.has(col.name) ? "column-pk" : "column",
              meta: col.dataType,
              badge: col.nullable === false ? "NOT NULL" : undefined,
              expandable: false,
            })),
        },
        {
          id: `${schema}:${table}:constraints`,
          label: "Constraints",
          kind: "constraints-folder",
          badge: details.constraints.length ? String(details.constraints.length) : undefined,
          expandable: details.constraints.length > 0,
          load: async () =>
            details.constraints.map((c) => ({
              id: `${schema}:${table}:con:${c.name}`,
              label: c.name,
              kind:
                c.constraintType === "PRIMARY KEY"
                  ? "constraint-pk"
                  : c.constraintType === "FOREIGN KEY"
                    ? "constraint-fk"
                    : "constraint-nn",
              meta:
                c.constraintType === "FOREIGN KEY" && c.columns[0]?.referencedTable
                  ? `→ ${c.columns[0].referencedTable}`
                  : c.constraintType,
              badge:
                c.enabled === false || c.enabled === "FALSE" ? "disabled" : undefined,
              expandable: false,
            })),
        },
      ];
    },
  };
}

function systemSchemasFolder(profileId: string): TreeNode {
  return {
    id: "system",
    label: "System Schemas",
    kind: "system-folder",
    expandable: true,
    load: async () =>
      ["SYS", "EXA_STATISTICS"].map((schema) => ({
        id: `sys:${schema}`,
        label: schema,
        kind: "system-schema",
        expandable: true,
        load: async () => {
          const { objects } = await ipc.listSystemObjects(profileId, schema);
          return objects.map((obj) => ({
            id: `sys:${schema}:${obj.name}`,
            label: obj.name,
            kind: "system-object",
            meta: obj.objectType ?? undefined,
            expandable: false,
            selectable: { schema, name: obj.name },
          }));
        },
      })),
  };
}

function dbaFolder(profileId: string): TreeNode {
  return {
    id: "dba",
    label: "DBA",
    kind: "dba-folder",
    expandable: true,
    load: async () => {
      const dba = await ipc.getDbaOverview(profileId);
      return [
        {
          id: "dba:users",
          label: "Users",
          kind: "users-folder",
          badge: String(dba.users.length),
          expandable: dba.users.length > 0,
          load: async () =>
            dba.users.map((u) => ({
              id: `dba:user:${u.name}`,
              label: u.name,
              kind: "user",
              meta: u.consumerGroup ?? undefined,
              expandable: false,
            })),
        },
        {
          id: "dba:roles",
          label: "Roles",
          kind: "roles-folder",
          badge: String(dba.roles.length),
          expandable: dba.roles.length > 0,
          load: async () =>
            dba.roles.map((r) => ({
              id: `dba:role:${r.name}`,
              label: r.name,
              kind: "role",
              expandable: false,
            })),
        },
        {
          id: "dba:consumer-groups",
          label: "Consumer Groups",
          kind: "consumer-groups-folder",
          badge: String(dba.consumerGroups.length),
          expandable: dba.consumerGroups.length > 0,
          load: async () =>
            dba.consumerGroups.map((g) => ({
              id: `dba:cg:${g.name}`,
              label: g.name,
              kind: "consumer-group",
              meta: g.precedence != null ? `precedence ${g.precedence}` : undefined,
              expandable: false,
            })),
        },
        {
          id: "dba:connections",
          label: "Connections",
          kind: "connections-folder",
          badge: String(dba.connections.length),
          expandable: dba.connections.length > 0,
          load: async () =>
            dba.connections.map((c) => ({
              id: `dba:conn:${c.name}`,
              label: c.name,
              kind: "connection",
              meta: c.userName ?? undefined,
              expandable: false,
            })),
        },
        {
          id: "dba:sessions",
          label: "Sessions",
          kind: "sessions-folder",
          badge: String(dba.sessions.length),
          expandable: dba.sessions.length > 0,
          load: async () =>
            dba.sessions.map((s) => ({
              id: `dba:session:${s.sessionId}`,
              label: `${s.sessionId} · ${s.userName ?? "?"}`,
              kind: "session",
              meta: s.status ?? undefined,
              expandable: false,
            })),
        },
      ];
    },
  };
}
