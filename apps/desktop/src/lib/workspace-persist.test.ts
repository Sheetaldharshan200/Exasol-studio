import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeWorkspace, deserializeWorkspace, type WorkspaceState } from "./workspace-persist.ts";
import type { SqlTab } from "@/components/studio/tabs";

function tab(over: Partial<SqlTab>): SqlTab {
  return {
    id: "t1",
    title: "Query",
    view: "sql",
    sql: "SELECT 1",
    response: null,
    execError: null,
    ...over,
  };
}

/** Round-trip a state through serialize → deserialize. */
function roundTrip(state: WorkspaceState): WorkspaceState | null {
  return deserializeWorkspace(serializeWorkspace(state));
}

test("round-trips a SQL tab, keeping identity + editor content", () => {
  const state: WorkspaceState = {
    tabsByConn: { c1: [tab({ id: "a", title: "Orders", sql: "SELECT * FROM ORDERS", resultPage: 2 })] },
    groupsByConn: {},
    activeIdByConn: { c1: "a" },
  };
  const out = roundTrip(state)!;
  assert.equal(out.tabsByConn.c1.length, 1);
  const t = out.tabsByConn.c1[0];
  assert.equal(t.id, "a");
  assert.equal(t.sql, "SELECT * FROM ORDERS");
  assert.equal(t.resultPage, 2);
  assert.equal(out.activeIdByConn.c1, "a");
});

test("drops transient/heavy fields (results, run status, progress, plan)", () => {
  const heavy = tab({
    id: "a",
    response: { results: [], totalElapsedMs: 5, success: true } as SqlTab["response"],
    execError: "boom",
    runMeta: { startedAt: 1, scope: "statement" },
    queryProgress: { elapsedMs: 10, finished: false },
  });
  const out = roundTrip({ tabsByConn: { c1: [heavy] }, groupsByConn: {}, activeIdByConn: {} })!;
  const t = out.tabsByConn.c1[0];
  assert.equal(t.response, null);
  assert.equal(t.execError, null);
  assert.equal(t.runMeta, undefined);
  assert.equal(t.queryProgress, undefined);
});

test("excludes ephemeral views (connect, welcome, marketplace, artifact)", () => {
  const state: WorkspaceState = {
    tabsByConn: {
      c1: [
        tab({ id: "keep", view: "sql" }),
        tab({ id: "drop1", view: "connect" }),
        tab({ id: "drop2", view: "welcome" }),
        tab({ id: "drop3", view: "artifact" }),
      ],
    },
    groupsByConn: {},
    activeIdByConn: {},
  };
  const out = roundTrip(state)!;
  assert.deepEqual(out.tabsByConn.c1.map((t) => t.id), ["keep"]);
});

test("prunes an active id that points at a dropped tab", () => {
  const state: WorkspaceState = {
    tabsByConn: { c1: [tab({ id: "keep", view: "sql" }), tab({ id: "gone", view: "welcome" })] },
    groupsByConn: {},
    activeIdByConn: { c1: "gone" },
  };
  const out = roundTrip(state)!;
  assert.equal(out.activeIdByConn.c1, undefined); // "gone" wasn't persisted
});

test("keeps a dashboard tab's dashboardId and an object tab's ref", () => {
  const state: WorkspaceState = {
    tabsByConn: {
      c1: [
        tab({ id: "d", view: "dashboard", dashboardId: "dash-42", title: "Sales" }),
        tab({ id: "o", view: "object", objectProfileId: "c1", objectRef: { type: "table", schema: "S", name: "T" } as unknown as SqlTab["objectRef"] }),
      ],
    },
    groupsByConn: {},
    activeIdByConn: {},
  };
  const out = roundTrip(state)!;
  assert.equal(out.tabsByConn.c1[0].dashboardId, "dash-42");
  assert.equal(out.tabsByConn.c1[1].objectProfileId, "c1");
});

test("connections with no persistable tabs are omitted entirely", () => {
  const state: WorkspaceState = {
    tabsByConn: { c1: [tab({ id: "w", view: "welcome" })] },
    groupsByConn: { c1: [{ id: "g", name: "grp", collapsed: false }] },
    activeIdByConn: { c1: "w" },
  };
  const out = roundTrip(state)!;
  assert.equal(out.tabsByConn.c1, undefined);
  assert.equal(out.groupsByConn.c1, undefined);
  assert.equal(out.activeIdByConn.c1, undefined);
});

test("drops tabs whose view is missing its required identity field", () => {
  const raw = JSON.stringify({
    v: 1,
    tabsByConn: {
      c1: [
        { id: "d-ok", title: "D", view: "dashboard", dashboardId: "x", sql: "" },
        { id: "d-bad", title: "D", view: "dashboard", sql: "" }, // no dashboardId
        { id: "o-bad", title: "O", view: "object", objectProfileId: "c1", sql: "" }, // no objectRef
        { id: "f-bad", title: "F", view: "filePreview", sql: "" }, // no filePath
      ],
    },
    groupsByConn: {},
    activeIdByConn: {},
  });
  const out = deserializeWorkspace(raw)!;
  assert.deepEqual(out.tabsByConn.c1.map((t) => t.id), ["d-ok"]);
});

test("deserialize returns null for empty, corrupt, or wrong-version input", () => {
  assert.equal(deserializeWorkspace(null), null);
  assert.equal(deserializeWorkspace(""), null);
  assert.equal(deserializeWorkspace("{not json"), null);
  assert.equal(deserializeWorkspace(JSON.stringify({ v: 999, tabsByConn: {} })), null);
  assert.equal(deserializeWorkspace(JSON.stringify({ tabsByConn: {} })), null); // no version
});

test("deserialize tolerates malformed tab entries without throwing", () => {
  const raw = JSON.stringify({
    v: 1,
    tabsByConn: { c1: [null, 42, { id: "ok", title: "T", view: "sql", sql: "SELECT 1" }, { view: "sql" }] },
    groupsByConn: {},
    activeIdByConn: {},
  });
  const out = deserializeWorkspace(raw)!;
  assert.equal(out.tabsByConn.c1.length, 1);
  assert.equal(out.tabsByConn.c1[0].id, "ok");
});
