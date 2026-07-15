---
name: artifact-builder
description: Build a polished, self-contained HTML insight artifact (filters, charts, downloadable)
---

# Building an artifact

Use `render_artifact({title, html})` to produce a single self-contained HTML document.

Rules:
- ONE document: inline all CSS in a `<style>` tag and all JS in a `<script>` tag. NO external URLs, CDNs, or fonts.
- Ground every number in real tool results (run_sql first). Never invent data — embed the actual rows as a JS array/const.
- Make it usable, not just pretty:
  - If the data has categories/dates, add simple **filter** controls (dropolldown/date range) that re-render the view with vanilla JS.
  - Include a small summary header (totals, key figures) and a clean table or chart.
  - Responsive layout; readable dark-on-light; a print-friendly body.
- Theme: neutral light background, one accent colour (#2f7d14 green). System font stack.
- Keep it under ~120 KB. For charts, draw with inline SVG or a tiny `<canvas>` — do not fetch a chart library.

Skeleton:
```html
<!doctype html><html><head><meta charset="utf-8"><style>/* inline */</style></head>
<body>
  <header>…title + summary…</header>
  <section class="filters">…controls…</section>
  <main id="view">…table/chart…</main>
  <script>const DATA = [/* real rows */]; function render(){…} /* filters call render() */ render();</script>
</body></html>
```

The app opens the artifact as a tab and offers a Download button — the user keeps the HTML file.
