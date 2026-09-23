import assert from "node:assert/strict";
import { test } from "node:test";
import { exportNotice } from "./export-notice.ts";

test("a cancelled save dialog is silent", () => {
  assert.equal(exportNotice({ ok: false }, "html"), null);
  assert.equal(exportNotice({ ok: false }, "pdf"), null);
});

test("an error becomes a warning carrying the message", () => {
  assert.deepEqual(exportNotice({ ok: false, error: "disk full" }, "md"), { kind: "warning", title: "Export failed", body: "disk full" });
});

test("a saved file names its path and links to it", () => {
  const n = exportNotice({ ok: true, path: "/tmp/sales.html" }, "html");
  assert.equal(n?.kind, "success");
  assert.equal(n?.body, "Saved /tmp/sales.html");
  assert.equal(n?.go, "file:/tmp/sales.html");
});

test("pdf points at the print dialog instead of a path", () => {
  const n = exportNotice({ ok: true, dialog: true }, "pdf");
  assert.equal(n?.title, "Print dialog opened");
  assert.equal(n?.go, undefined);
});

test("pdf says how to print when the window opened without a dialog", () => {
  const n = exportNotice({ ok: true, dialog: false }, "pdf");
  assert.equal(n?.title, "Print window opened");
  assert.match(n?.body ?? "", /P/);
});

test("a failure during data collection is reported, not swallowed", () => {
  assert.deepEqual(exportNotice({ ok: false, error: "widget query failed" }, "pdf"), {
    kind: "warning",
    title: "Export failed",
    body: "widget query failed",
  });
});
