import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { graphifyPaths } from "./graphify-config.mjs";

const graphifyDir = graphifyPaths.sourceDir;
const outputDir = graphifyPaths.renderedDir;

await mkdir(outputDir, { recursive: true });

const files = (await readdir(graphifyDir))
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .sort();

const dom = new JSDOM(
  "<!doctype html><html><body><div id=\"graphify-root\"></div></body></html>",
  { pretendToBeVisual: true }
);

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Node = dom.window.Node;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true
});
if (!globalThis.CSSStyleSheet) {
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    constructor() {
      this.content = "";
      this.cssRules = [];
    }

    replaceSync(content) {
      this.content = content;
      this.cssRules = content
        .split("}")
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => ({ cssText: `${rule}}` }));
    }

    insertRule(rule) {
      this.cssRules.push({ cssText: rule });
      return this.cssRules.length - 1;
    }
  };
}
if (!("adoptedStyleSheets" in document)) {
  document.adoptedStyleSheets = [];
}
if (!globalThis.SVGElement.prototype.getBBox) {
  globalThis.SVGElement.prototype.getBBox = function getBBox() {
    const text = this.textContent || "";
    const width = Math.max(32, text.length * 8);
    const height = 24;
    return {
      x: 0,
      y: 0,
      width,
      height
    };
  };
}
if (!globalThis.SVGElement.prototype.getComputedTextLength) {
  globalThis.SVGElement.prototype.getComputedTextLength =
    function getComputedTextLength() {
      const text = this.textContent || "";
      return Math.max(16, text.length * 8);
    };
}

const { default: mermaid } = await import("mermaid");

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose"
});

for (const file of files) {
  const fullPath = path.join(graphifyDir, file);
  const content = await readFile(fullPath, "utf8");
  const match = content.match(/```mermaid\s*([\s\S]*?)```/);

  if (!match) {
    throw new Error(`No mermaid block found in ${file}`);
  }

  const baseName = path.basename(file, ".md");
  const container = document.getElementById("graphify-root");

  if (!container) {
    throw new Error("Graphify render root not found.");
  }

  container.innerHTML = "";

  const { svg } = await mermaid.render(
    `graphify-${baseName}`,
    match[1].trim(),
    container
  );
  await writeFile(path.join(outputDir, `${baseName}.svg`), svg, "utf8");
}

console.log(`Rendered ${files.length} graphify diagrams to ${outputDir}`);
