import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DashboardStore } from "./dashboards.ts";

/** A minimal valid dashboard doc for the store. */
function doc(id: string, group?: string) {
  return {
    version: 1 as const,
    id,
    title: `Dash ${id}`,
    ...(group ? { group } : {}),
    panels: [
      {
        id: "p1",
        title: "Panel",
        grid: { x: 0, y: 0, w: 6, h: 6 },
        query: { sql: "SELECT 1 AS TOTAL" },
        viz: { type: "kpi" as const },
      },
    ],
  };
}

function withStore(fn: (store: DashboardStore) => void) {
  const dir = mkdtempSync(join(tmpdir(), "dash-store-"));
  try {
    fn(new DashboardStore(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("delete removes a user dashboard", () => {
  withStore((store) => {
    store.save(doc("user-1"));
    assert.equal(store.delete("user-1"), true);
    assert.equal(store.get("user-1"), null);
  });
});

test("delete refuses a System dashboard and leaves it intact", () => {
  withStore((store) => {
    store.save(doc("sys-1", "System"));
    assert.equal(store.delete("sys-1"), false);
    // Still present and readable after the refused delete.
    assert.equal(store.get("sys-1")?.id, "sys-1");
  });
});

test("delete of a non-existent id returns false", () => {
  withStore((store) => {
    assert.equal(store.delete("nope"), false);
  });
});

test("a dashboard with a non-System group is still deletable", () => {
  withStore((store) => {
    store.save(doc("grp-1", "Finance"));
    assert.equal(store.delete("grp-1"), true);
    assert.equal(store.get("grp-1"), null);
  });
});

test("save refuses to overwrite an existing System dashboard", () => {
  withStore((store) => {
    store.save(doc("sys-2", "System"));
    // An agent / external MCP PUT with the same id must not mutate it.
    assert.throws(
      () => store.save({ ...doc("sys-2", "System"), title: "Hijacked" }),
      /read-only/i,
    );
    assert.equal(store.get("sys-2")?.title, "Dash sys-2");
  });
});

test("seeding a fresh System dashboard (blank id) still works", () => {
  withStore((store) => {
    // Seeds arrive with a blank id; save mints a new one and persists.
    const seeded = store.save({ ...doc("ignored", "System"), id: "" });
    assert.ok(seeded.id);
    assert.equal(seeded.group, "System");
    assert.equal(store.get(seeded.id)?.group, "System");
  });
});

test("rollback of a System dashboard is a no-op (returns null)", () => {
  withStore((store) => {
    const seeded = store.save({ ...doc("ignored", "System"), id: "" });
    assert.equal(store.rollback(seeded.id, 0), null);
  });
});

test("a user dashboard can still be overwritten by save", () => {
  withStore((store) => {
    store.save(doc("user-2"));
    const updated = store.save({ ...doc("user-2"), title: "Renamed" });
    assert.equal(updated.title, "Renamed");
    assert.equal(store.get("user-2")?.title, "Renamed");
  });
});
