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

/** The state a header is tokenized in once its language is known. */
export const headerStateFor = (languageId: string): string => `${UDF_HEADER_STATE}_${languageId}`;

/** The pattern that matches a language word where a language may stand. */
function languageWord(languageId: string): string {
  // Exasol writes PYTHON3 for Monaco's `python`, and will write PYTHON4 one
  // day; a trailing version is part of the word, not a different language.
  return languageId === "python" ? "PYTHON\\d*" : escapeForPattern(languageId);
}

/**
 * The header rule that recognises which language a block is written in.
 *
 * It matches the word only where Exasol's grammar puts a language — directly
 * before `[SCALAR|SET|ADAPTER|AGGREGATE] SCRIPT`. Matching it anywhere in the
 * header coloured a script *named* `"JAVA"` as Java, and matching it as the
 * point the body begins handed the REST OF THE SQL HEADER to the other
 * language's tokenizer. So this rule only records the language; `asRule`
 * below decides where the body starts.
 *
 * The ids come from Monaco at runtime, so this enumerates nothing: a language
 * Monaco gains is embedded without an edit here.
 */
export function languageRule(languageId: string): [RegExp, Record<string, string>] {
  return [
    new RegExp(`\\b(?:${languageWord(languageId)})\\b(?=\\s+(?:SCALAR\\s+|SET\\s+|ADAPTER\\s+|AGGREGATE\\s+)?SCRIPT\\b)`, "i"),
    { token: "keyword", next: `@${headerStateFor(languageId)}` },
  ];
}

/**
 * The rule that ends the header and hands the body to the language.
 *
 * `AS` last on its line is what ends a CREATE … SCRIPT header, and it may sit
 * several lines below the language word — requiring the two on one line left
 * multi-line headers with an unhighlighted body.
 */
export function asRule(languageId: string): [RegExp, Record<string, string>] {
  return [/\bAS\b(?=\s*$)/i, { token: "keyword", next: `@${UDF_BODY_STATE}`, nextEmbedded: languageId }];
}

const escapeForPattern = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The line that closes a block, from anywhere inside it. */
const CLOSE_RULE: [RegExp, Record<string, string>] = [/^\s*\/\s*$/, { token: "comment.udf", next: "@popall" }];

/**
 * Patch a Monarch SQL definition so `--/ … /` blocks tokenize as their own
 * language. Pure: it returns a new definition and leaves the original alone,
 * which is what makes this testable without an editor.
 *
 * Three states, because a block has three parts: the header before the
 * language is known, the header after it is known, and the body. Collapsing
 * the first two is what made the rest of the header tokenize as Python.
 */
export function withUdfEmbedding(base: MonarchLanguage, languageIds: readonly string[] = []): MonarchLanguage {
  const root = base.tokenizer.root ?? [];
  // `CREATE SCRIPT` with no language named is Lua, by Exasol's own default.
  const fallback = languageIds.includes("lua") ? "lua" : null;
  const perLanguage = Object.fromEntries(
    languageIds.map((id) => [
      headerStateFor(id),
      [CLOSE_RULE, asRule(id), { include: "root" }],
    ]),
  );
  return {
    ...base,
    tokenizer: {
      ...base.tokenizer,
      // The opening marker takes precedence over SQL's line-comment rule,
      // which would otherwise swallow `--/` as an ordinary comment.
      root: [[/^\s*--\/.*$/, { token: "comment.udf", next: `@${UDF_HEADER_STATE}` }], ...root],
      // The header before a language is known. It is ordinary SQL; the only
      // thing watched for is the language word, and the `SCRIPT` that means
      // there will not be one.
      [UDF_HEADER_STATE]: [
        CLOSE_RULE,
        ...languageIds.map(languageRule),
        ...(fallback ? [[/\bSCRIPT\b/i, { token: "keyword", next: `@${headerStateFor(fallback)}` }] as [RegExp, Record<string, string>]] : []),
        { include: "root" },
      ],
      ...perLanguage,
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
 * Which languages to embed comes from the CALLER — in the app, the connected
 * database's own SCRIPT_LANGUAGES — so a server that gains a language
 * container gains highlighting for it with no code change. A word Monaco has
 * no grammar for is simply skipped, and each grammar has to be loaded before
 * it can tokenize anything, so they are loaded up front once.
 */
export async function installUdfEmbedding(monaco: MonacoApi, words: readonly string[]): Promise<void> {
  const languages = monaco.languages.getLanguages();
  const sql = languages.find((l) => l.id === "sql") as
    | { id: string; loader?: () => Promise<{ language?: MonarchLanguage }> }
    | undefined;
  if (!sql?.loader) return;

  // The server's script languages, as Monaco knows them. A word Monaco has no
  // grammar for simply stays SQL. Lua is always in the set: Exasol has it
  // built in, and it is what `CREATE SCRIPT` with no language means.
  const known = languages.map((l) => l.id);
  const embeds = [...new Set(["LUA", ...words])]
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
  monaco.languages.setMonarchTokensProvider("sql", withUdfEmbedding(loaded.language, embeds) as never);
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
