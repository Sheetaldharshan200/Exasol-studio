// Which top-level folders a connection shows in the navigator, in order.
// Pure, so the Settings → Database Objects Tree options are testable.

export type TreeOptions = { showSystemSchemas?: boolean };
export type TreeFolder = "schemas" | "virtual" | "system" | "dba";

export function visibleFolders(opts: TreeOptions = {}): TreeFolder[] {
  // SYS and EXA_STATISTICS: shown unless turned off.
  return opts.showSystemSchemas === false ? ["schemas", "virtual", "dba"] : ["schemas", "virtual", "system", "dba"];
}
