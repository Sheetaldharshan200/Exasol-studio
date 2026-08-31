import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { graphifyPaths } from "./graphify-config.mjs";

const graphifyDir = graphifyPaths.sourceDir;

const files = (await readdir(graphifyDir))
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .sort();

if (files.length === 0) {
  console.error("No graphify markdown files found.");
  process.exit(1);
}

let invalid = false;

for (const file of files) {
  const fullPath = path.join(graphifyDir, file);
  const content = await readFile(fullPath, "utf8");
  const mermaidBlocks = [...content.matchAll(/```mermaid\s*([\s\S]*?)```/g)];

  if (mermaidBlocks.length !== 1) {
    console.error(
      `${file}: expected exactly 1 mermaid block, found ${mermaidBlocks.length}.`
    );
    invalid = true;
    continue;
  }

  if (!mermaidBlocks[0][1].trim()) {
    console.error(`${file}: mermaid block is empty.`);
    invalid = true;
  }
}

if (invalid) {
  process.exit(1);
}

console.log(`Graphify validation passed for ${files.length} files.`);
