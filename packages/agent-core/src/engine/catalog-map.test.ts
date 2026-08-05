import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapCatalog } from "./catalog-map.ts";
import { authPath, upsertProviderAuth } from "./auth-store.ts";

describe("mapCatalog", () => {
  test("popular providers come first in pinned order, then A–Z", () => {
    const out = mapCatalog({
      zebra: { name: "Zebra AI", models: { a: {} } },
      anthropic: { name: "Anthropic", env: ["ANTHROPIC_API_KEY"], models: { a: {}, b: {} } },
      alpha: { name: "Alpha", models: {} },
      ollama: { name: "Ollama", models: { x: {} } },
      groq: { name: "Groq", models: { x: {} } },
    });
    assert.deepEqual(out.map((p) => p.id), ["ollama", "anthropic", "groq", "alpha", "zebra"]);
    assert.equal(out[0].popular, true);
    assert.equal(out[3].popular, false);
  });

  test("carries env vars and model counts; tolerates junk entries", () => {
    const out = mapCatalog({
      openai: { name: "OpenAI", env: ["OPENAI_API_KEY"], models: { a: {}, b: {}, c: {} } },
      broken: undefined,
    });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].env, ["OPENAI_API_KEY"]);
    assert.equal(out[0].modelCount, 3);
  });

  test("empty catalog maps to empty list", () => {
    assert.deepEqual(mapCatalog({}), []);
  });
});

describe("upsertProviderAuth", () => {
  test("creates auth.json and merges subsequent keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "exa-auth-"));
    upsertProviderAuth(dir, "openai", "sk-1");
    upsertProviderAuth(dir, "anthropic", "sk-2");
    upsertProviderAuth(dir, "openai", "sk-3"); // overwrite
    const parsed = JSON.parse(readFileSync(authPath(dir), "utf8"));
    assert.deepEqual(parsed, {
      openai: { type: "api", key: "sk-3" },
      anthropic: { type: "api", key: "sk-2" },
    });
  });
});
