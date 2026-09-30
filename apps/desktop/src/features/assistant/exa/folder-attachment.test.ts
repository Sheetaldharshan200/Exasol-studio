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

test("a folder the OS picker already copied is one chip whose entries carry their saved paths", async () => {
  const { makeSavedFolderAttachment, readFolderManifest, isFolderAttachment } = await import("./folder-attachment.ts");
  const f = makeSavedFolderAttachment("datasets", [
    { name: "sales/2024.csv", size: 10, path: "/home/u/ExasolStudio/attachments/datasets/sales/2024.csv" },
    { name: "README.md", size: 3, path: "/home/u/ExasolStudio/attachments/datasets/README.md" },
  ]);
  assert.ok(isFolderAttachment(f));
  assert.equal(f.name, "datasets");
  const m = await readFolderManifest(f);
  assert.equal(m?.count, 2);
  assert.equal(m?.entries[0].savedPath, "/home/u/ExasolStudio/attachments/datasets/sales/2024.csv");
  assert.equal(m?.entries[0].path, "sales/2024.csv", "the chip still shows the folder-relative name");
  assert.equal(m?.skipped, 0);
  assert.equal(m?.capped, false);
  const partial = makeSavedFolderAttachment("repo", [{ name: "a.ts", size: 1, path: "/att/repo/a.ts" }], { skipped: 7, capped: true });
  const pm = await readFolderManifest(partial);
  assert.equal(pm?.skipped, 7, "what the walk left out travels with the chip");
  assert.equal(pm?.capped, true);
});

test("a single picked file already on disk round-trips its record; inline bytes rebuild a real file", async () => {
  const { makeSavedFileAttachment, readSavedFile, isSavedFileAttachment, fileFromInline } = await import("./folder-attachment.ts");
  const f = makeSavedFileAttachment({ name: "orders.parquet", size: 123456, path: "/att/orders.parquet" });
  assert.ok(isSavedFileAttachment(f));
  assert.equal(f.name, "orders.parquet");
  assert.deepEqual(await readSavedFile(f), { name: "orders.parquet", size: 123456, path: "/att/orders.parquet" });
  assert.equal(await readSavedFile(new File(["not json"], "x", { type: "application/x-exasol-saved-file" })), null);
  const img = fileFromInline("dot.png", "image/png", "iVBORw0KGgo=");
  assert.equal(img.type, "image/png");
  assert.equal(img.size, 8);
  assert.ok(!isSavedFileAttachment(img), "an inline file takes the stock path");
});
