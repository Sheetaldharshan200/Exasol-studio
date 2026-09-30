import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESETS, answerCell, decodeAnswer, decodeRow, flagValue, isReadOnlyQuery, parseCriteria, questionProblem, rankRows, rowState, toCsv, toQuestions, type Answer, type Question } from "./decisions.ts";

const noul: Question = { id: "suspicious", type: "noul", instructions: "?", criteria: [] };
const score: Question = { id: "risk", type: "score", instructions: "?", criteria: ["none", "low", "medium", "high"] };
const choice: Question = { id: "pattern", type: "choice", instructions: "?", criteria: ["none", "duplicate", "odd timing"] };

test("presets are sendable and every choice starts with the 'nothing wrong' label", () => {
  for (const p of PRESETS) {
    for (const q of p.questions) {
      assert.equal(questionProblem(q), null, `${p.id}/${q.id}`);
      if (q.type === "choice") assert.equal(q.criteria[0], "none");
    }
    const ids = p.questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
  }
});

test("question problems are named", () => {
  assert.equal(questionProblem({ ...noul, id: "bad id" }), "id must be a plain word");
  assert.equal(questionProblem({ ...noul, instructions: " " }), "instructions are empty");
  assert.equal(questionProblem({ ...choice, criteria: ["only"] }), "a choice needs 2–255 options");
  assert.equal(questionProblem({ ...score, criteria: Array(11).fill("x") }), "a score needs 2–10 levels");
  assert.equal(questionProblem({ ...choice, criteria: ["a", " "] }), "an empty option");
});

test("the wire shape carries criteria only where the type has them", () => {
  const q = toQuestions([noul, score]);
  assert.deepEqual(q.suspicious, { type: "noul", instructions: "?" });
  assert.deepEqual(q.risk, { type: "score", instructions: "?", criteria: ["none", "low", "medium", "high"] });
  assert.deepEqual(parseCriteria(" a, b ,, c "), ["a", "b", "c"]);
});

test("a row becomes column → value with nulls kept", () => {
  const cols = [{ name: "AMOUNT", typeName: "DECIMAL" }, { name: "VENDOR", typeName: "VARCHAR" }];
  assert.deepEqual({ ...rowState(cols, [12.5, undefined]) }, { AMOUNT: 12.5, VENDOR: null });
});

test("flag values come from every answer type and stay in [0,1]", () => {
  assert.equal(flagValue({ type: "noul", noul: 0.91 }, noul), 0.91);
  assert.equal(flagValue({ type: "noul", noul: 1.7 }, noul), 1, "clamped");
  assert.ok(Math.abs((flagValue({ type: "score", score: 2.1, confidence: 0.5, probabilities: {} }, score) ?? 0) - 0.7) < 1e-9);
  assert.equal(flagValue({ type: "choice", choice: "duplicate", confidence: 0.6, probabilities: { none: 0.25, duplicate: 0.6, "odd timing": 0.15 } }, choice), 0.75);
  assert.equal(flagValue(null, noul), null);
  assert.equal(flagValue({ type: "choice", choice: "x", confidence: 0, probabilities: {} }, choice), null, "no probability for the first option → no flag");
});

test("cells show the decision and its probability", () => {
  assert.deepEqual(answerCell({ type: "noul", noul: 0.91 }, noul), { text: "yes", detail: "91% yes" });
  assert.deepEqual(answerCell({ type: "noul", noul: 0.2 }, noul), { text: "no", detail: "20% yes" });
  assert.deepEqual(answerCell({ type: "score", score: 2.6, confidence: 0.5, probabilities: {} }, score), { text: "high", detail: "2.60 / 3" });
  assert.deepEqual(answerCell({ type: "choice", choice: "duplicate", confidence: 0.6, probabilities: { duplicate: 0.6 } }, choice), { text: "duplicate", detail: "60%" });
  assert.equal(answerCell(undefined, noul).text, "—");
});

test("flagged rows come first by value; the count follows the threshold", () => {
  const flags = [0.2, 0.95, null, 0.7, 0.71];
  assert.deepEqual(rankRows(5, flags, 0.7), { order: [1, 4, 3, 0, 2], flagged: 3 });
  assert.deepEqual(rankRows(5, flags, 0.99), { order: [0, 1, 2, 3, 4], flagged: 0 });
});

test("csv adds a decision column and a flag column per question and escapes values", () => {
  const cols = [{ name: "ID", typeName: "INT" }, { name: "NOTE", typeName: "VARCHAR" }];
  const rows = [[1, 'say "hi", ok'], [2, null]];
  const answers: (Record<string, Answer> | null)[] = [{ suspicious: { type: "noul", noul: 0.9 } }, null];
  const csv = toCsv(cols, rows, [noul], answers);
  assert.equal(csv.split("\n")[0], "ID,NOTE,suspicious,suspicious_flag");
  assert.equal(csv.split("\n")[1], '1,"say ""hi"", ok",yes,0.9000');
  assert.equal(csv.split("\n")[2], "2,,—,");
});

test("the source must be one read-only statement", () => {
  assert.equal(isReadOnlyQuery("SELECT * FROM T"), true);
  assert.equal(isReadOnlyQuery("  -- note\nWITH x AS (SELECT 1) SELECT * FROM x;"), true);
  assert.equal(isReadOnlyQuery("/* c */ select 1"), true);
  assert.equal(isReadOnlyQuery("DELETE FROM T"), false);
  assert.equal(isReadOnlyQuery("SELECT 1; DROP TABLE T"), false);
  assert.equal(isReadOnlyQuery("CREATE TABLE T(a INT)"), false);
  assert.equal(isReadOnlyQuery(""), false);
});

test("a row state has no prototype and keeps repeated column names apart", () => {
  const cols = [{ name: "__proto__", typeName: "VARCHAR" }, { name: "ID", typeName: "INT" }, { name: "ID", typeName: "INT" }];
  const s = rowState(cols, ["x", 1, 2]);
  assert.equal(Object.getPrototypeOf(s), null);
  assert.equal(s["__proto__"], "x");
  assert.equal(s.ID, 1);
  assert.equal(s.ID_2, 2);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("answers are decoded from the wire and malformed ones become no answer", () => {
  assert.deepEqual(decodeAnswer({ type: "noul", noul: 0.4 }), { type: "noul", noul: 0.4 });
  assert.equal(decodeAnswer({ type: "noul", noul: "high" }), null);
  assert.equal(decodeAnswer({ type: "score", score: "2", probabilities: {} }), null);
  assert.deepEqual(decodeAnswer({ type: "choice", choice: "none", confidence: 0.3, probabilities: { none: 0.6 } }), { type: "choice", choice: "none", confidence: 0.3, probabilities: { none: 0.6 } });
  assert.equal(decodeAnswer({ type: "choice", choice: "none", probabilities: { none: "?" } }), null);
  assert.equal(decodeAnswer("text"), null);
  assert.deepEqual(decodeRow({ suspicious: { type: "noul", noul: 0.9 }, other: 1 }, [noul]), { suspicious: { type: "noul", noul: 0.9 } });
  assert.equal(decodeRow(null, [noul]), null);
});

test("csv neutralises formula-leading text but not numbers", () => {
  const cols = [{ name: "N", typeName: "INT" }, { name: "S", typeName: "VARCHAR" }];
  const csv = toCsv(cols, [[-5, "=SUM(A1)"], [3, "@cmd"]], [], []);
  assert.equal(csv.split("\n")[1], "-5,'=SUM(A1)");
  assert.equal(csv.split("\n")[2], "3,'@cmd");
});
