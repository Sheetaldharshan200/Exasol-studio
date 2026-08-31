import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeRuntimes,
  looksLikeRuntime,
  parseModelList,
  pickDefaultProvider,
  rankProviders,
  type DiscoveredRuntime,
} from "./runtime-registry.ts";

describe("parseModelList", () => {
  test("Ollama /api/tags shape", () => {
    const out = parseModelList("ollama", { models: [{ name: "llama3:8b", model: "llama3:8b" }, { name: "qwen" }] });
    assert.deepEqual(out, [
      { id: "llama3:8b", name: "llama3:8b" },
      { id: "qwen", name: "qwen" },
    ]);
  });
  test("OpenAI /v1/models shape", () => {
    assert.deepEqual(parseModelList("openai-compatible", { data: [{ id: "gpt-oss" }, { id: "mixtral" }] }), [
      { id: "gpt-oss", name: "gpt-oss" },
      { id: "mixtral", name: "mixtral" },
    ]);
  });
  test("drops empties and dedupes ids", () => {
    const out = parseModelList("ollama", { models: [{ name: "" }, { model: "a" }, { model: "a" }, {}] });
    assert.deepEqual(out, [{ id: "a", name: "a" }]);
  });
  test("junk bodies yield []", () => {
    assert.deepEqual(parseModelList("ollama", null), []);
    assert.deepEqual(parseModelList("openai-compatible", { data: "nope" }), []);
    assert.deepEqual(parseModelList("ollama", "string"), []);
  });
});

describe("looksLikeRuntime", () => {
  test("validates the claimed shape", () => {
    assert.ok(looksLikeRuntime("ollama", { models: [] }));
    assert.ok(looksLikeRuntime("openai-compatible", { data: [] }));
    assert.ok(!looksLikeRuntime("ollama", { data: [] })); // wrong shape for kind
    assert.ok(!looksLikeRuntime("openai-compatible", { hello: "world" }));
    assert.ok(!looksLikeRuntime("ollama", null));
  });
});

describe("dedupeRuntimes", () => {
  test("merges by baseUrl ignoring trailing slashes, drops blanks", () => {
    const r = (id: string, baseUrl: string): DiscoveredRuntime => ({ id, label: id, kind: "openai-compatible", baseUrl, models: [] });
    const out = dedupeRuntimes([r("a", "http://x/v1"), r("b", "http://x/v1/"), r("c", "")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "b"); // last write wins
  });
});

describe("rankProviders", () => {
  test("local before in-db before cloud, stable within tier", () => {
    const out = rankProviders([
      { id: "openai", kind: "cloud" },
      { id: "ollama", kind: "local" },
      { id: "indb", kind: "in-db" },
      { id: "lmstudio", kind: "local" },
    ]);
    assert.deepEqual(out.map((p) => p.id), ["ollama", "lmstudio", "indb", "openai"]);
  });
});

describe("pickDefaultProvider", () => {
  const P = (id: string, kind: "cloud" | "local" | "in-db", models: unknown[] = []) => ({ id, kind, models });
  test("prefers a local runtime that actually has models", () => {
    const d = pickDefaultProvider([P("openai", "cloud", [1]), P("ollama", "local", []), P("lmstudio", "local", [1])]);
    assert.equal(d?.id, "lmstudio");
  });
  test("in-db counts as usable even with no model list", () => {
    assert.equal(pickDefaultProvider([P("openai", "cloud", [1]), P("indb", "in-db")])?.id, "indb");
  });
  test("cloud is never the silent default", () => {
    assert.equal(pickDefaultProvider([P("openai", "cloud", [1])]), null);
    assert.equal(pickDefaultProvider([P("openai", "cloud", [1])], { allowCloudFallback: true })?.id, "openai");
  });
  test("empty in → null", () => {
    assert.equal(pickDefaultProvider([]), null);
  });
});
