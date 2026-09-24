// Where the language's own code begins inside a `--/ … /` script block.
//
// A block is two things stacked: a SQL header that declares the script, and
// under it a function in another language. Typing behaves differently in the
// two halves, so something has to know where the line between them falls.
//
// Nothing here enumerates languages. Exasol's set of script languages is
// whatever `SCRIPT_LANGUAGES` says on the database you are connected to, and
// a container can be added without anyone touching this app, so every
// decision below is made from the header's own words.

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
    if (/\bAS\s*$/i.test(headerCode(lines[i]))) return i + 1;
  }
  return null;
}

/**
 * A header line with everything that is not code taken out.
 *
 * Order matters and is the whole point: quoted text is removed FIRST, so the
 * dashes in `CREATE LUA SCRIPT "load--daily" AS` are not read as a comment
 * that swallows the `AS`. Block comments go too, so a header ending in `AS`
 * followed by a bracketed note still ends on its `AS`.
 */
function headerCode(line: string): string {
  return line
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/"(?:""|[^"])*"/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/, "")
    .trimEnd();
}
