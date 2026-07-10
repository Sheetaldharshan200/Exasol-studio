import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const configPath = path.join(repoRoot, ".graphify/config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

export { repoRoot, configPath, config };

export const graphifyPaths = {
  sourceDir: path.join(repoRoot, config.sourceDir),
  renderedDir: path.join(repoRoot, config.renderedDir),
  siteDir: path.join(repoRoot, config.siteDir),
  siteEntry: path.join(repoRoot, config.siteDir, config.siteEntry)
};
