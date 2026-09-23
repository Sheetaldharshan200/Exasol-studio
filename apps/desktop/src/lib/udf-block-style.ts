// How a `--/ … /` script block is dressed in the editor.
//
// A UDF block is a piece of Lua, Python, Java, R — or whatever language the
// database has been taught since — sitting inside a SQL buffer. It is not
// SQL, it does not run like the statements around it, and the editor should
// say so at a glance.
//
// Nothing here enumerates languages. Exasol's set of script languages is
// whatever `SCRIPT_LANGUAGES` says on the database you are connected to, and
// a container can be added without anyone touching this app; a fixed list
// would quietly render every new language identically. The accent is derived
// from the language's own name instead, so any language gets a stable colour
// of its own, and the same language always gets the same one.

/** A hue, derived from the name so it never changes between sessions. */
function hueOf(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 360000;
  return hash % 360;
}

/** The colour a language's rail and pill are drawn in. */
export function udfAccentColor(language: string | null | undefined): string | null {
  const name = language?.trim().toLowerCase();
  if (!name) return null;
  // Saturation and lightness are fixed so every accent carries the same
  // weight against the editor background — only the hue tells them apart.
  return `hsl(${hueOf(name)} 70% 62%)`;
}

/** What the language chip reads. Null when the header has not named one yet —
 *  an empty chip is worse than no chip. */
export function udfChipLabel(language: string | null | undefined): string | null {
  const name = language?.trim();
  return name ? `${name.toUpperCase()} SCRIPT` : null;
}

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

/** One stylesheet rule per language actually seen, injected on demand: Monaco
 *  decorations take a class name, not a style object, so the accent has to
 *  reach the line through a generated rule. */
export function udfAccentRule(language: string, className: string): string {
  const color = udfAccentColor(language);
  return color ? `.${className}{--exa-udf-accent:${color}}` : "";
}

/** A class name safe to put in a stylesheet and a decoration, for any
 *  language string the database or the user produces. */
export function udfAccentClass(language: string | null | undefined): string | null {
  const name = language?.trim().toLowerCase();
  if (!name) return null;
  // Anything that is not a plain word becomes its code points, so a language
  // named with punctuation or a non-Latin script still yields a valid class.
  const safe = /^[a-z0-9]+$/.test(name)
    ? name
    : [...name].map((c) => c.codePointAt(0)!.toString(36)).join("");
  return `exa-udf-lang-${safe}`;
}
