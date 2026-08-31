import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { graphifyPaths } from "./graphify-config.mjs";

const renderedDir = graphifyPaths.renderedDir;
const outputDir = graphifyPaths.siteDir;
const files = (await readdir(renderedDir)).filter((file) => file.endsWith(".svg")).sort();

await mkdir(outputDir, { recursive: true });

const cards = files
  .map((file) => {
    const title = file
      .replace(/\.svg$/, "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return `<article class="card"><h2>${title}</h2><img src="../rendered/${file}" alt="${title}" /></article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Exasol Studio Graphify</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07161d;
        --panel: #112b35;
        --line: rgba(255,255,255,0.1);
        --text: #eff7f9;
        --muted: #9ab1b9;
        --accent: #5fc33b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, sans-serif;
        background: linear-gradient(180deg, #061118 0%, #0a1a22 100%);
        color: var(--text);
      }
      header {
        padding: 32px 28px 18px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      p {
        margin: 10px 0 0;
        color: var(--muted);
        max-width: 760px;
        line-height: 1.6;
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 18px;
        padding: 0 28px 28px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 14px 48px rgba(0,0,0,0.22);
      }
      .card h2 {
        margin: 0 0 14px;
        font-size: 16px;
      }
      .card img {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--line);
      }
      .badge {
        display: inline-flex;
        margin-top: 14px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(95,195,59,0.16);
        color: var(--accent);
        border: 1px solid rgba(95,195,59,0.28);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Graphify</h1>
      <p>Implementation-aware system diagrams for Exasol Studio. These SVGs are generated from the Mermaid source files in the foundation docs and surfaced here for quick visual review in a browser.</p>
      <div class="badge">${files.length} diagrams rendered</div>
    </header>
    <main>
      ${cards}
    </main>
  </body>
</html>`;

await writeFile(path.join(outputDir, "index.html"), html, "utf8");
console.log(`Built Graphify HTML index with ${files.length} diagrams.`);
