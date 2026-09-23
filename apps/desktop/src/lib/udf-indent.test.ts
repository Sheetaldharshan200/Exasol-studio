import assert from "node:assert/strict";
import { test } from "node:test";
import { increasesIndent, indentUnit, leadingIndent, matchEnterRule, nextIndent, opensBracket, type LangConf } from "./udf-indent.ts";

// Monaco's IndentAction values, passed in the way the editor passes them.
const ACTIONS = { Indent: 1, Outdent: 3, IndentOutdent: 2 };

/** Monaco's own Python configuration, verbatim from its basic-languages. */
const PYTHON: LangConf = {
  onEnterRules: [
    {
      beforeText: new RegExp("^\\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async|match|case).*?:\\s*$"),
      action: { indentAction: ACTIONS.Indent },
    },
  ],
};
/** A brace language, as Monaco declares one: brackets, no enter rules. */
const JAVA: LangConf = { brackets: [["{", "}"], ["[", "]"], ["(", ")"]] };

test("Python indents after its own rule, which Monaco maintains, not us", () => {
  assert.equal(nextIndent(PYTHON, { beforeText: "if x > 1:" }, 4, ACTIONS), "    ");
  assert.equal(nextIndent(PYTHON, { beforeText: "    def run(ctx):" }, 4, ACTIONS), "        ");
});

test("a line Python's rule does not cover keeps the indent", () => {
  assert.equal(nextIndent(PYTHON, { beforeText: "    x = 1" }, 4, ACTIONS), "    ");
  // A colon that is not a block opener is not matched by the language's rule.
  assert.equal(nextIndent(PYTHON, { beforeText: "d = {1: 2}" }, 4, ACTIONS), "");
});

test("a brace language indents from its declared brackets", () => {
  assert.equal(opensBracket(JAVA, "void run() {"), true);
  assert.equal(opensBracket(JAVA, "int x = 1;"), false);
  assert.equal(nextIndent(JAVA, { beforeText: "  void run() {" }, 4, ACTIONS), "      ");
});

test("a language Monaco has no configuration for keeps the indent, never guesses", () => {
  assert.equal(nextIndent(null, { beforeText: "if x:" }, 4, ACTIONS), "");
  assert.equal(nextIndent({}, { beforeText: "  if x:" }, 4, ACTIONS), "  ");
});

test("rules are tried in the order the language declares them", () => {
  const conf: LangConf = {
    onEnterRules: [
      { beforeText: /^a/, action: { indentAction: ACTIONS.Indent } },
      { beforeText: /^ab/, action: { indentAction: ACTIONS.Outdent } },
    ],
  };
  assert.equal(matchEnterRule(conf, { beforeText: "abc" })?.action.indentAction, ACTIONS.Indent);
});

test("a rule's other conditions are honoured too", () => {
  const conf: LangConf = {
    onEnterRules: [{ beforeText: /\{$/, afterText: /^\}/, action: { indentAction: ACTIONS.IndentOutdent } }],
  };
  assert.equal(matchEnterRule(conf, { beforeText: "f() {", afterText: "}" })?.action.indentAction, ACTIONS.IndentOutdent);
  assert.equal(matchEnterRule(conf, { beforeText: "f() {", afterText: "" }), null);
});

test("an outdent rule steps back, and stops at the margin", () => {
  const conf: LangConf = { onEnterRules: [{ beforeText: /end$/, action: { indentAction: ACTIONS.Outdent } }] };
  assert.equal(nextIndent(conf, { beforeText: "        end" }, 4, ACTIONS), "    ");
  assert.equal(nextIndent(conf, { beforeText: "end" }, 4, ACTIONS), "");
});

test("a rule's appended text comes through", () => {
  const conf: LangConf = { onEnterRules: [{ beforeText: /^\s*\/\*/, action: { indentAction: 0, appendText: " * " } }] };
  assert.equal(nextIndent(conf, { beforeText: "  /*" }, 4, ACTIONS), "   * ");
});

test("a language's own indentation pattern is used when it has one", () => {
  const conf: LangConf = { indentationRules: { increaseIndentPattern: /\bdo\s*$/ } };
  assert.equal(increasesIndent(conf, "for i = 1, 10 do"), true);
  assert.equal(nextIndent(conf, { beforeText: "for i = 1, 10 do" }, 2, ACTIONS), "  ");
});

test("a block indented with tabs keeps using tabs", () => {
  assert.equal(indentUnit("\tx", 4), "\t");
  assert.equal(indentUnit("    x", 4), "    ");
  assert.equal(nextIndent(PYTHON, { beforeText: "\tif x:" }, 4, ACTIONS), "\t\t");
});

test("leading whitespace is read exactly as written", () => {
  assert.equal(leadingIndent("\t x"), "\t ");
  assert.equal(leadingIndent("x"), "");
});
