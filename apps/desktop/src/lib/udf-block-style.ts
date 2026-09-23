// How a `--/ … /` script block is dressed in the editor.
//
// A UDF block is a piece of Lua, Python, Java, R — or whatever language the
// database has been taught since — sitting inside a SQL buffer. It is not
// SQL, it does not run like the statements around it, and the editor should
// say so at a glance.
//
// Nothing here enumerates languages. Exasol's set of script languages is
// whatever `SCRIPT_LANGUAGES` says on the database you are connected to, and
// a container can be added without anyone touching this app, so every
// decision below is made from the header's own words.

/** The whole-line classes for one line of a block: the shared surface, and
 *  the rounding that closes the card at top and bottom. The accent travels as
 *  a CSS variable rather than a class, because there is no fixed set of
 *  languages to write classes for. */
export function udfLineClasses(opts: { first: boolean; last: boolean }): string {
  const classes = ["exa-udf-block"];
  if (opts.first) classes.push("exa-udf-open");
  if (opts.last) classes.push("exa-udf-close");
  return classes.join(" ");
}

/** Which part of a block a line belongs to. */
export type UdfLineRole = "open" | "header" | "body" | "close";

/**
 * Where the language's own code starts inside a block.
 *
 * A block is two things stacked: a SQL header (`CREATE … SCRIPT … AS`) and,
 * under it, a function written in another language. The split is the line the
 * header's `AS` ends on — everything after that belongs to the language. A
 * header still being typed has no `AS` yet, and then there is no body to
 * frame.
 *
 * `lines` are the block's lines, the first being the `--/` marker.
 */
export function udfBodyStart(lines: readonly string[]): number | null {
  for (let i = 1; i < lines.length; i++) {
    // `AS` ends the header; a line that is only a comment cannot.
    if (/\bAS\s*$/i.test(lines[i].replace(/--.*$/, "").trimEnd())) return i + 1;
  }
  return null;
}

/** What each line of a block is, so the renderer can frame the two cells. */
export function udfLineRole(index: number, opts: { last: number; bodyStart: number | null }): UdfLineRole {
  if (index === 0) return "open";
  if (index === opts.last) return "close";
  if (opts.bodyStart !== null && index >= opts.bodyStart) return "body";
  return "header";
}

/** What a cell's header bar says about the script it holds. */
export type UdfCellHeading = { language: string | null; name: string | null; kind: string | null };

/**
 * Read a block's CREATE header for the things a cell header shows: which
 * language, what the script is called, and whether it is SCALAR or SET.
 *
 * Deliberately forgiving — the header is being typed while this runs, so
 * every part is optional and a half-written header simply yields fewer
 * fields rather than nothing at all.
 */
export function udfCellHeading(header: string): UdfCellHeading {
  const flat = header.replace(/\s+/g, " ").trim();
  const language = /\bCREATE\s+(?:OR\s+REPLACE\s+)?([A-Za-z][A-Za-z0-9]*)\s+(?:SCALAR|SET|ADAPTER)?\s*SCRIPT\b/i.exec(flat)?.[1] ?? null;
  const kind = /\b(SCALAR|SET|ADAPTER)\s+SCRIPT\b/i.exec(flat)?.[1]?.toUpperCase() ?? null;
  // The name follows SCRIPT, up to the parameter list or the end.
  const name = /\bSCRIPT\s+("?[\w.]+"?(?:\."?[\w]+"?)?)/i.exec(flat)?.[1] ?? null;
  return { language, name, kind };
}
