/**
 * Monaco editor themes matched to the Studio light/dark palettes, with every
 * syntax role user-recolorable from Settings → SQL Editor Colors.
 *
 * The pure parts (role table, defaults, hex sanitizing, rule building) are
 * exported so the Settings UI and the unit tests share one source of truth.
 */
import { type Monaco } from "@monaco-editor/react";

/**
 * The syntax roles a user can recolor. Each maps to EVERY Monarch token the
 * SQL grammar can emit for that role — including the `.sql`-suffixed variants
 * the base vs/vs-dark themes pin to their own colors (string.sql pure red,
 * predefined.sql magenta, operator.sql slate), which outrank any generic rule.
 * Miss one and that token silently keeps the base color.
 */
export const SYNTAX_ROLES = [
  // keyword.block = BEGIN/CASE/END, .choice = WHEN/THEN, .try/.catch = TRY/CATCH scopes.
  { key: "keyword", label: "Keywords", tokens: ["keyword", "keyword.block", "keyword.choice", "keyword.try", "keyword.catch"] },
  // Single-quoted literals (also N'…'); string.sql beats a generic rule.
  { key: "string", label: "Strings", tokens: ["string", "string.sql"] },
  { key: "number", label: "Numbers", tokens: ["number", "number.hex"] },
  // comment.quote is the /* and */ delimiters of block comments.
  { key: "comment", label: "Comments", tokens: ["comment", "comment.quote"] },
  // Built-in functions AND built-in variables/pseudo-columns (@@…, $…).
  { key: "function", label: "Built-in functions", tokens: ["predefined", "predefined.sql"] },
  { key: "operator", label: "Operators", tokens: ["operator", "operator.sql"] },
  // Commas, semicolons, dots, and (round/square) brackets.
  { key: "punctuation", label: "Punctuation", tokens: ["delimiter", "delimiter.parenthesis", "delimiter.square"] },
  // Plain identifiers — tables, columns, and UDF/script names (anything not in
  // Monaco's built-in list) — plus the quotes of "quoted identifiers".
  { key: "identifier", label: "Identifiers", tokens: ["identifier", "identifier.quote"] },
] as const;

export type SyntaxRoleKey = (typeof SYNTAX_ROLES)[number]["key"];
export type SyntaxColors = Partial<Record<SyntaxRoleKey, string>>;
export type SyntaxOverrides = { dark?: SyntaxColors; light?: SyntaxColors };

export const SYNTAX_DEFAULTS: Record<"dark" | "light", Record<SyntaxRoleKey, string>> = {
  dark: {
    keyword: "#82dd4b",
    string: "#e9a94f",
    number: "#5fd0c0",
    comment: "#6a6a70",
    function: "#6db3f2",
    operator: "#c9c9cf",
    punctuation: "#9d9da6",
    identifier: "#ededee",
  },
  light: {
    keyword: "#157f3c",
    string: "#a7681c",
    number: "#0b73a2",
    comment: "#6b7280",
    function: "#2563eb",
    operator: "#334155",
    punctuation: "#64748b",
    identifier: "#0b1730",
  },
};

/** The flat settings key a role's color persists under (app-settings.json). */
export function syntaxSettingKey(theme: "dark" | "light", role: SyntaxRoleKey): string {
  return theme === "dark" ? `synDark_${role}` : `synLight_${role}`;
}

/** Normalize a user-entered color to "#rrggbb", or null when invalid. */
export function sanitizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
}

/** Pull the persisted syntax overrides out of a flat settings record. */
export function syntaxOverridesFromSettings(s: Record<string, unknown>): SyntaxOverrides {
  const pick = (theme: "dark" | "light") => {
    const out: SyntaxColors = {};
    for (const role of SYNTAX_ROLES) {
      const hex = sanitizeHex(s[syntaxSettingKey(theme, role.key)]);
      if (hex && hex !== SYNTAX_DEFAULTS[theme][role.key]) out[role.key] = hex;
    }
    return out;
  };
  return { dark: pick("dark"), light: pick("light") };
}

type ThemeRule = { token: string; foreground: string; fontStyle?: string };

/** Monarch rules for a theme: defaults merged with (valid) user overrides. */
export function buildSyntaxRules(theme: "dark" | "light", overrides?: SyntaxColors): ThemeRule[] {
  const rules: ThemeRule[] = [];
  for (const role of SYNTAX_ROLES) {
    const color = sanitizeHex(overrides?.[role.key]) ?? SYNTAX_DEFAULTS[theme][role.key];
    const foreground = color.slice(1);
    for (const token of role.tokens) {
      const rule: ThemeRule = { token, foreground };
      if (role.key === "keyword") rule.fontStyle = "bold";
      if (role.key === "comment") rule.fontStyle = "italic";
      rules.push(rule);
    }
  }
  return rules;
}

/**
 * Bracket-pair colorization (on by default) paints () with its own depth
 * colors, ignoring the delimiter token — so the pairs follow the user's
 * punctuation color too, uniformly across all six depths.
 */
function bracketColors(theme: "dark" | "light", overrides?: SyntaxColors): Record<string, string> {
  const c = sanitizeHex(overrides?.punctuation) ?? SYNTAX_DEFAULTS[theme].punctuation;
  const out: Record<string, string> = {};
  for (let i = 1; i <= 6; i++) out[`editorBracketHighlight.foreground${i}`] = c;
  return out;
}

/**
 * Define (or re-define) the exasol-dark/exasol-light themes. Monaco applies a
 * re-defined theme immediately when it is the active one, so calling this
 * again with new overrides recolors open editors live.
 */
export function defineMonacoThemes(monaco: Monaco, overrides?: SyntaxOverrides) {
  monaco.editor.defineTheme("exasol-dark", {
    base: "vs-dark",
    inherit: true,
    rules: buildSyntaxRules("dark", overrides?.dark),
    colors: {
      ...bracketColors("dark", overrides?.dark),
      "editor.background": "#0a0a0b",
      "editor.foreground": "#ededee",
      "editor.lineHighlightBackground": "#151517",
      "editorLineNumber.foreground": "#3a3a40",
      "editorLineNumber.activeForeground": "#8a8a90",
      "editor.selectionBackground": "#26331d",
      "editorCursor.foreground": "#5fc33b",
      "editorIndentGuide.background1": "#1c1c1f",
    },
  });
  monaco.editor.defineTheme("exasol-light", {
    base: "vs",
    inherit: true,
    rules: buildSyntaxRules("light", overrides?.light),
    colors: {
      ...bracketColors("light", overrides?.light),
      "editor.background": "#ffffff",
      "editor.foreground": "#0b1730",
      "editor.lineHighlightBackground": "#f1f5fb",
      "editorLineNumber.foreground": "#9aa2ab",
      "editorLineNumber.activeForeground": "#0b1730",
      "editorCursor.foreground": "#4fa823",
    },
  });
}
