import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnosticsText } from "./diagnostics.ts";

const info = { appVersion: "2026.10.1", tauriVersion: "2.11.5", os: "macos 26.0", arch: "aarch64", dataDir: "/d", logsDir: "/d/logs" };

test("diagnostics list versions and the system, then the recent log", () => {
  assert.equal(
    diagnosticsText(info, { userAgent: "UA", log: "a\nb\n" }),
    "Exasol Studio 2026.10.1\nTauri 2.11.5\nOS: macos 26.0 aarch64\nWebview: UA\n\nRecent log:\na\nb\n",
  );
});

test("no log and no user agent: just the facts; never the data folder", () => {
  const t = diagnosticsText(info);
  assert.equal(t, "Exasol Studio 2026.10.1\nTauri 2.11.5\nOS: macos 26.0 aarch64\n");
  assert.equal(t.includes("/d"), false);
});
