// Which top-level folders a connection shows in the navigator, in order.
// Pure, so the Settings → Database Objects Tree options are testable.

export type TreeOptions = { showSystemSchemas?: boolean };
export type TreeFolder = "schemas" | "virtual" | "system" | "dba";

export function visibleFolders(opts: TreeOptions = {}): TreeFolder[] {
  // SYS and EXA_STATISTICS: shown unless turned off.
  return opts.showSystemSchemas === false ? ["schemas", "virtual", "dba"] : ["schemas", "virtual", "system", "dba"];
}

/** After a refresh, the freshly loaded children of a folder that were
 *  expanded before and so load next. Objects that are gone are not among
 *  them; new ones start collapsed. */
export function expandedChildren<T extends { id: string }>(children: readonly T[], expanded: ReadonlySet<string>): T[] {
  return children.filter((c) => expanded.has(c.id));
}
