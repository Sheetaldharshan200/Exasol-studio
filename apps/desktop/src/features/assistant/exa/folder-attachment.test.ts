import assert from "node:assert/strict";
import { test } from "node:test";
import { FOLDER_MIME, isFolderAttachment, makeFolderAttachment, readFolderManifest, topFolderName } from "./folder-attachment.ts";

/** A File carrying a webkitRelativePath, like the folder picker produces. */
function relFile(relPath: string, bytes = "x"): File {
  const f = new File([bytes], relPath.split("/").pop() ?? relPath, { type: "text/csv" });
  Object.defineProperty(f, "webkitRelativePath", { value: relPath, configurable: true });
  return f;
}

test("topFolderName takes the first path segment", () => {
  assert.equal(topFolderName([relFile("datasets/sales/2024.csv")]), "datasets");
  assert.equal(topFolderName([new File(["x"], "loose.csv")]), "loose.csv");
  assert.equal(topFolderName([]), "folder");
});

test("makeFolderAttachment yields one synthetic folder File the manifest round-trips", async () => {
  const files = [relFile("datasets/sales/2024.csv", "a,b\n1,2"), relFile("datasets/customers/list.csv", "id\n9")];
  const synthetic = makeFolderAttachment(files);
  assert.equal(synthetic.type, FOLDER_MIME);
  assert.equal(synthetic.name, "datasets");
  assert.ok(isFolderAttachment(synthetic));
  assert.ok(!isFolderAttachment(new File(["x"], "x.csv", { type: "text/csv" })));

  const m = await readFolderManifest(synthetic);
  assert.ok(m);
  assert.equal(m!.folder, "datasets");
  assert.equal(m!.count, 2);
  assert.deepEqual(
    m!.entries.map((e) => e.path),
    ["datasets/sales/2024.csv", "datasets/customers/list.csv"],
  );
});

test("readFolderManifest returns null on a non-folder file", async () => {
  assert.equal(await readFolderManifest(new File(["not json"], "x.csv", { type: "text/csv" })), null);
});
