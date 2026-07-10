import {
  Boxes,
  Braces,
  ChevronsLeftRightEllipsis,
  Columns3,
  Database,
  FileCode2,
  FileTerminal,
  FunctionSquare,
  Gauge,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Network,
  Play,
  ScrollText,
  Server,
  ShieldUser,
  Table2,
  Terminal,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type NodeKind =
  | "server"
  | "schemas-folder"
  | "schema"
  | "virtual-schema"
  | "tables-folder"
  | "table"
  | "columns-folder"
  | "column"
  | "column-pk"
  | "constraints-folder"
  | "constraint-pk"
  | "constraint-fk"
  | "constraint-nn"
  | "views-folder"
  | "view"
  | "functions-folder"
  | "function"
  | "scripts-folder"
  | "script-adapter"
  | "script-udf"
  | "script-lua"
  | "script-preprocessor"
  | "system-folder"
  | "system-schema"
  | "system-object"
  | "dba-folder"
  | "users-folder"
  | "user"
  | "roles-folder"
  | "role"
  | "consumer-groups-folder"
  | "consumer-group"
  | "connections-folder"
  | "connection"
  | "sessions-folder"
  | "session"
  | "db-size";

/** One icon per Exasol object kind — keeps the tree legible and consistent. */
export const NODE_ICON: Record<NodeKind, LucideIcon> = {
  server: Database,
  "schemas-folder": Layers,
  schema: Boxes,
  "virtual-schema": Waypoints,
  "tables-folder": Table2,
  table: Table2,
  "columns-folder": Columns3,
  column: Columns3,
  "column-pk": KeyRound,
  "constraints-folder": Lock,
  "constraint-pk": KeyRound,
  "constraint-fk": Link2,
  "constraint-nn": Lock,
  "views-folder": ScrollText,
  view: ScrollText,
  "functions-folder": FunctionSquare,
  function: FunctionSquare,
  "scripts-folder": FileCode2,
  "script-adapter": Network,
  "script-udf": Braces,
  "script-lua": FileTerminal,
  "script-preprocessor": ChevronsLeftRightEllipsis,
  "system-folder": Server,
  "system-schema": Gauge,
  "system-object": Table2,
  "dba-folder": ShieldUser,
  "users-folder": Users,
  user: ShieldUser,
  "roles-folder": Users,
  role: ShieldUser,
  "consumer-groups-folder": Gauge,
  "consumer-group": Gauge,
  "connections-folder": Link2,
  connection: Link2,
  "sessions-folder": Terminal,
  session: Play,
  "db-size": Gauge,
};

export function scriptKind(scriptType: string): NodeKind {
  switch (scriptType.toUpperCase()) {
    case "ADAPTER":
      return "script-adapter";
    case "UDF":
      return "script-udf";
    case "PREPROCESSOR":
      return "script-preprocessor";
    default:
      return "script-lua";
  }
}
