import assert from "node:assert/strict";
import { test } from "node:test";
import { personaFromAnswers } from "./persona.ts";

const roleQ = { question: "What best describes your role?" };

test("maps common role answers to persona ids", () => {
  assert.equal(personaFromAnswers([roleQ], [["Developer"]]), "data-engineer");
  assert.equal(personaFromAnswers([roleQ], [["Software engineer"]]), "data-engineer");
  assert.equal(personaFromAnswers([roleQ], [["Data Scientist"]]), "data-scientist");
  assert.equal(personaFromAnswers([roleQ], [["BI analyst"]]), "bi-analyst");
  assert.equal(personaFromAnswers([roleQ], [["Business Analyst"]]), "data-analyst");
  assert.equal(personaFromAnswers([roleQ], [["Finance team"]]), "finance-analyst");
  assert.equal(personaFromAnswers([roleQ], [["DBA"]]), "dba");
  assert.equal(personaFromAnswers([roleQ], [["Executive / manager"]]), "executive");
});

test("only a role-shaped question can set the persona", () => {
  assert.equal(personaFromAnswers([{ question: "Which schema should I use?" }], [["Developer"]]), null);
  assert.equal(personaFromAnswers([{ question: "Who is this report for?" }], [["Executive"]]), null);
  assert.equal(personaFromAnswers([{ question: "Which role should the report target?" }], [["Executive"]]), null);
});

test("scans multiple questions and tolerates gaps", () => {
  const qs = [{ question: "How much detail do you want?" }, roleQ];
  assert.equal(personaFromAnswers(qs, [["Just the answer"], ["Developer"]]), "data-engineer");
  assert.equal(personaFromAnswers(qs, [["Just the answer"]]), null);
  assert.equal(personaFromAnswers([], []), null);
});

test("unrecognized answers leave the persona untouched", () => {
  assert.equal(personaFromAnswers([roleQ], [["Student"]]), null);
  assert.equal(personaFromAnswers([roleQ], [[""]]), null);
});

test("negated answers set nothing", () => {
  assert.equal(personaFromAnswers([roleQ], [["not a developer"]]), null);
  assert.equal(personaFromAnswers([roleQ], [["I don't do finance"]]), null);
  assert.equal(personaFromAnswers([roleQ], [["non-technical manager"]]), null);
});

test("first-picked answer wins on multi-select", () => {
  assert.equal(personaFromAnswers([roleQ], [["Developer", "sometimes DBA"]]), "data-engineer");
});
