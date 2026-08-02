import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SYNTAX_DEFAULTS,
  SYNTAX_ROLES,
  buildSyntaxRules,
  sanitizeHex,
  syntaxOverridesFromSettings,
  syntaxSettingKey,
} from "./monaco-theme.ts";

describe("sanitizeHex", () => {
  test("accepts #rrggbb with or without the hash, normalizing case", () => {
    assert.equal(sanitizeHex("#82DD4B"), "#82dd4b");
    assert.equal(sanitizeHex("82dd4b"), "#82dd4b");
    assert.equal(sanitizeHex("  #82dd4b  "), "#82dd4b");
  });

  test("expands 3-digit shorthand", () => {
    assert.equal(sanitizeHex("#f0a"), "#ff00aa");
  });

  test("rejects invalid input", () => {
    assert.equal(sanitizeHex(""), null);
    assert.equal(sanitizeHex("#12345"), null);
    assert.equal(sanitizeHex("#gggggg"), null);
    assert.equal(sanitizeHex("red"), null);
    assert.equal(sanitizeHex(42), null);
    assert.equal(sanitizeHex(null), null);
    assert.equal(sanitizeHex(undefined), null);
  });
});

describe("buildSyntaxRules", () => {
  test("defaults cover every role's tokens (incl. string.sql and identifier.quote)", () => {
    const rules = buildSyntaxRules("dark");
    const tokens = rules.map((r) => r.token);
    for (const role of SYNTAX_ROLES) for (const t of role.tokens) assert.ok(tokens.includes(t), t);
    assert.equal(rules.find((r) => r.token === "string.sql")?.foreground, "e9a94f");
  });

  test("an override recolors all of the role's tokens", () => {
    const rules = buildSyntaxRules("dark", { identifier: "#ff8800" });
    assert.equal(rules.find((r) => r.token === "identifier")?.foreground, "ff8800");
    assert.equal(rules.find((r) => r.token === "identifier.quote")?.foreground, "ff8800");
  });

  test("an invalid override falls back to the theme default", () => {
    const rules = buildSyntaxRules("light", { keyword: "not-a-color" });
    assert.equal(rules.find((r) => r.token === "keyword")?.foreground, SYNTAX_DEFAULTS.light.keyword.slice(1));
  });

  test("keywords stay bold and comments italic even when recolored", () => {
    const rules = buildSyntaxRules("dark", { keyword: "#123456", comment: "#654321" });
    assert.equal(rules.find((r) => r.token === "keyword")?.fontStyle, "bold");
    assert.equal(rules.find((r) => r.token === "comment")?.fontStyle, "italic");
  });
});

describe("syntaxOverridesFromSettings", () => {
  test("picks only valid, non-default colors from the flat settings record", () => {
    const overrides = syntaxOverridesFromSettings({
      [syntaxSettingKey("dark", "keyword")]: "#ff0000", // changed
      [syntaxSettingKey("dark", "string")]: SYNTAX_DEFAULTS.dark.string, // default → dropped
      [syntaxSettingKey("dark", "number")]: "junk", // invalid → dropped
      [syntaxSettingKey("light", "comment")]: "#112233",
      unrelatedSetting: true,
    });
    assert.deepEqual(overrides.dark, { keyword: "#ff0000" });
    assert.deepEqual(overrides.light, { comment: "#112233" });
  });

  test("empty settings yield empty overrides", () => {
    assert.deepEqual(syntaxOverridesFromSettings({}), { dark: {}, light: {} });
  });
});
