import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlanBlock, heaviestStatement, type PlanRecord } from "./plan-block.ts";

const part = (over: PlanRecord): PlanRecord => ({
  STMT_ID: 100,
  PART_NAME: "PIPE SCAN",
  PART_INFO: "",
  OBJECT_SCHEMA: "SYS",
  OBJECT_NAME: "DUAL",
  OBJECT_ROWS: 1,
  IN_ROWS: 1,
  OUT_ROWS: 1,
  DURATION: 0.0001,
  CPU: 50,
  TEMP_DB_RAM_PEAK: 0,
  REMARKS: "",
  ...over,
});

test("heaviestStatement picks the statement with the most total time", () => {
  const records = [
    part({ STMT_ID: 1, DURATION: 0.0001 }), // internal DUAL probe
    part({ STMT_ID: 2, DURATION: 0.01 }),
    part({ STMT_ID: 2, DURATION: 0.02 }),
    part({ STMT_ID: 3, DURATION: 0.005 }),
  ];
  const best = heaviestStatement(records);
  assert.equal(best.length, 2);
  assert.ok(best.every((r) => r.STMT_ID === 2));
});

test("heaviestStatement handles empty input and string durations", () => {
  assert.deepEqual(heaviestStatement([]), []);
  const best = heaviestStatement([part({ STMT_ID: 9, DURATION: "0.5" }), part({ STMT_ID: 8, DURATION: 0.1 })]);
  assert.equal(best[0].STMT_ID, 9);
});

test("buildPlanBlock renders ms and merges schema.object", () => {
  const block = buildPlanBlock([part({ DURATION: 0.0234 })], "EXA_USER_PROFILE_LAST_DAY");
  assert.ok(block.includes("SYS.DUAL"));
  assert.ok(block.includes("23 |") || block.includes("| 23"), block); // 0.0234s → 23ms
  assert.ok(block.includes("durations in ms"));
});

test("buildPlanBlock drops columns that are empty on every row", () => {
  const block = buildPlanBlock(
    [part({ PART_INFO: "", REMARKS: "", OBJECT_SCHEMA: "", OBJECT_NAME: "" })],
    "src",
  );
  assert.ok(!block.includes("info"));
  assert.ok(!block.includes("notes"));
  assert.ok(!block.includes("object |"));
});

test("buildPlanBlock caps parts and says how many were omitted", () => {
  const records = Array.from({ length: 40 }, (_, i) => part({ PART_ID: i }));
  const block = buildPlanBlock(records, "src");
  assert.ok(block.includes("(+15 more parts omitted)"));
  assert.equal(block.split("\n").filter((l) => l.includes("PIPE SCAN")).length, 25);
});

test("buildPlanBlock is empty for no records", () => {
  assert.equal(buildPlanBlock([], "src"), "");
});
