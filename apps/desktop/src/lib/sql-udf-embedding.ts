// Making a UDF body read as the language it is written in.
//
// A `--/ … /` block holds Lua, Python, Java or R, but the editor tokenizes
// the whole buffer as SQL, so a Lua function came out coloured as if its
// words were SQL keywords — `end` and `function` in SQL's palette, strings
// and comments following SQL's rules rather than the language's. It looked
// like mis-highlighted SQL rather than like writing a function.
//
// Monarch can hand a region to another language's tokenizer (`nextEmbedded`,
// the same mechanism that highlights <script> inside HTML). This patches
// Monaco's own SQL grammar with the states that do it, rather than
// re-writing a SQL grammar of our own. No language is named here: the one to
// embed comes from the CREATE header's own word, so a database taught a new
// script language needs no change.

/** The shape we need from a Monarch language definition; it carries more. */
export type MonarchLanguage = {
  tokenizer: Record<string, unknown[]>;
  [key: string]: unknown;
};

/** The state a block's body is tokenized in. */
export const UDF_BODY_STATE = "exaUdfBody";
/** The state between `--/` and the end of the CREATE header. */
export const UDF_HEADER_STATE = "exaUdfHeader";

/**
 * Monaco's language id for a word from a CREATE header. Exasol writes
 * `PYTHON3`, Monaco knows it as `python`; everything else is already its own
 * id in lower case. Unknown words return null and the body stays SQL rather
 * than being handed to a tokenizer that does not exist.
 */
export function embeddedLanguageId(word: string, known: readonly string[]): string | null {
  const name = word.trim().toLowerCase();
  if (!name) return null;
  // PYTHON3 → python, and any future PYTHON4 with it.
  const base = /^python\d*$/.test(name) ? "python" : name;
  return known.includes(base) ? base : null;
}

/**
 * Patch a Monarch SQL definition so `--/ … /` blocks tokenize as their own
 * language. Pure: it returns a new definition and leaves the original alone,
 * which is what makes this testable without an editor.
 */
export function withUdfEmbedding(base: MonarchLanguage): MonarchLanguage {
  const root = base.tokenizer.root ?? [];
  return {
    ...base,
    tokenizer: {
      ...base.tokenizer,
      // The opening marker takes precedence over SQL's line-comment rule,
      // which would otherwise swallow `--/` as an ordinary comment.
      root: [[/^\s*--\/.*$/, { token: "comment.udf", next: `@${UDF_HEADER_STATE}` }], ...root],
      // The CREATE header is still SQL, and the body begins after the `AS`
      // that ends it. The language word is captured there and handed on.
      [UDF_HEADER_STATE]: [
        [/^\s*\/\s*$/, { token: "comment.udf", next: "@pop" }],
        [
          /\b(LUA|PYTHON\d*|JAVA|R)\b(?=[^\n]*\bAS\b)/i,
          { token: "keyword", next: `@${UDF_BODY_STATE}.$1`, nextEmbedded: "$1" },
        ],
        { include: "root" },
      ],
      // Everything until a line holding only `/` belongs to the embedded
      // language; that line ends the embedding and the block together.
      [UDF_BODY_STATE]: [
        [/^\s*\/\s*$/, { token: "@rematch", next: "@pop", nextEmbedded: "@pop" }],
        [/[^]+?/, ""],
      ],
    },
  };
}

type MonacoApi = typeof import("monaco-editor");

/**
 * Install the embedding on Monaco's own SQL grammar.
 *
 * The languages to embed are whatever Monaco has grammars for — asked at
 * runtime, never listed here — and each one's grammar has to be loaded before
 * it can tokenize anything, so they are loaded up front once.
 */
export async function installUdfEmbedding(monaco: MonacoApi): Promise<void> {
  const languages = monaco.languages.getLanguages();
  const sql = languages.find((l) => l.id === "sql") as
    | { id: string; loader?: () => Promise<{ language?: MonarchLanguage }> }
    | undefined;
  if (!sql?.loader) return;

  // Exasol's script languages, as Monaco knows them. A word Monaco has no
  // grammar for simply stays SQL.
  const known = languages.map((l) => l.id);
  const embeds = ["LUA", "PYTHON3", "JAVA", "R"]
    .map((word) => embeddedLanguageId(word, known))
    .filter((id): id is string => Boolean(id));
  await Promise.all(
    embeds.map(async (id) => {
      const entry = languages.find((l) => l.id === id) as { loader?: () => Promise<unknown> } | undefined;
      await entry?.loader?.();
    }),
  );

  const loaded = await sql.loader();
  if (!loaded.language) return;
  monaco.languages.setMonarchTokensProvider("sql", withUdfEmbedding(loaded.language) as never);
  // The same languages' configurations drive indentation inside a block.
  await loadEmbeddedConfigs(monaco);
}

/** Monaco's own configuration for each language it can embed, keyed by the
 *  word a CREATE header would use. Loaded from Monaco, never written here, so
 *  a language's indentation and brackets stay whatever upstream says. */
const configs = new Map<string, unknown>();

/** The configuration for the language a block declares, or null. */
export function embeddedConfig(language: string | null | undefined): unknown {
  const name = language?.trim().toLowerCase();
  if (!name) return null;
  const base = /^python\d*$/.test(name) ? "python" : name;
  return configs.get(base) ?? null;
}

/** Load and remember the configurations of every language Monaco can embed. */
export async function loadEmbeddedConfigs(monaco: MonacoApi): Promise<void> {
  const languages = monaco.languages.getLanguages() as {
    id: string;
    loader?: () => Promise<{ conf?: unknown }>;
  }[];
  await Promise.all(
    languages.map(async (entry) => {
      if (configs.has(entry.id) || !entry.loader) return;
      try {
        const loaded = await entry.loader();
        if (loaded.conf) configs.set(entry.id, loaded.conf);
      } catch {
        // A language that will not load simply has no configuration; the body
        // then keeps the editor's default behaviour.
      }
    }),
  );
}
