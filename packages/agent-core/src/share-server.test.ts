import assert from "node:assert/strict";
import { test, after } from "node:test";
import { get } from "node:http";
import { startShare, publishShare, rotateShare, stopShare, shareStatus, resetShareServer } from "./share-server.ts";

after(() => resetShareServer());

function fetchShare(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

test("a valid token serves the html; a missing/wrong token gets an identical 404", async () => {
  const { port, token } = await startShare("d1", "<h1>Live</h1>");
  const ok = await fetchShare(port, `/s/d1?t=${token}`);
  assert.equal(ok.status, 200);
  assert.match(ok.body, /Live/);

  const noToken = await fetchShare(port, `/s/d1`);
  const wrong = await fetchShare(port, `/s/d1?t=wrong`);
  assert.equal(noToken.status, 404);
  assert.equal(wrong.status, 404);
  assert.equal(noToken.body, wrong.body); // identical denial
});

test("an unknown share and the gateway path both 404 (no leak, no gateway reach)", async () => {
  const { port, token } = await startShare("d1", "<h1>Live</h1>");
  const unknown = await fetchShare(port, `/s/other?t=${token}`);
  const gateway = await fetchShare(port, `/gateway/action?t=${token}`);
  assert.equal(unknown.status, 404);
  assert.equal(gateway.status, 404);
});

test("publish updates the served html without changing the token", async () => {
  const { port, token } = await startShare("d1", "<h1>v1</h1>");
  assert.equal(publishShare("d1", "<h1>v2</h1>"), true);
  const r = await fetchShare(port, `/s/d1?t=${token}`);
  assert.match(r.body, /v2/);
});

test("rotate invalidates the old link and issues a working new one", async () => {
  const { port, token } = await startShare("d1", "<h1>x</h1>");
  const next = rotateShare("d1");
  assert.ok(next && next !== token);
  assert.equal((await fetchShare(port, `/s/d1?t=${token}`)).status, 404); // old dead
  assert.equal((await fetchShare(port, `/s/d1?t=${next}`)).status, 200); // new works
});

test("stop makes the share unreachable", async () => {
  const { port, token } = await startShare("solo", "<h1>x</h1>");
  assert.equal(shareStatus("solo").active, true);
  stopShare("solo");
  assert.equal(shareStatus("solo").active, false);
  // server may have torn down (last share) — a refused connection is also 'gone'.
  await fetchShare(port, `/s/solo?t=${token}`).then(
    (r) => assert.equal(r.status, 404),
    () => assert.ok(true),
  );
});
