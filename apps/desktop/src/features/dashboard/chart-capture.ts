// Capture a dashboard chart widget's CURRENT rendering to a PNG data URL, so the
// export and the live-shared page show the exact same chart as the app — same
// shadcn colors and layout. shadcn charts render as SVG (whose colors come from
// CSS variables), so we clone the SVG and inline the computed colors before
// rasterizing; echarts-fallback charts render to a <canvas>, which we read
// directly. Runs in the browser against the mounted widget (tagged data-widget-id).

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

/** Capture the chart inside a widget's DOM node, or null if none is rendered. */
export async function captureChartPng(widgetId: string): Promise<string | null> {
  const host = document.querySelector<HTMLElement>(`[data-widget-id="${cssEscape(widgetId)}"]`);
  if (!host) return null;
  const canvas = host.querySelector("canvas");
  if (canvas instanceof HTMLCanvasElement) {
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  const svg = host.querySelector("svg");
  if (svg instanceof SVGSVGElement) return svgToPng(svg);
  return null;
}

async function svgToPng(svg: SVGSVGElement): Promise<string | null> {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || svg.clientWidth || 640));
  const h = Math.max(1, Math.round(rect.height || svg.clientHeight || 360));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll<Element>("*");
  const dst = clone.querySelectorAll<Element>("*");
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const cs = getComputedStyle(src[i]);
    const d = dst[i] as SVGElement;
    const tag = src[i].tagName.toLowerCase();
    if (cs.fill && cs.fill !== "none") d.setAttribute("fill", cs.fill);
    if (cs.stroke && cs.stroke !== "none") d.setAttribute("stroke", cs.stroke);
    if (cs.strokeWidth) d.setAttribute("stroke-width", cs.strokeWidth);
    if (cs.fillOpacity) d.setAttribute("fill-opacity", cs.fillOpacity);
    if (cs.strokeOpacity) d.setAttribute("stroke-opacity", cs.strokeOpacity);
    if (cs.opacity && cs.opacity !== "1") d.setAttribute("opacity", cs.opacity);
    if (tag === "stop") {
      const sc = (cs as unknown as { stopColor?: string }).stopColor;
      if (sc) d.setAttribute("stop-color", sc);
    }
    if (tag === "text" || tag === "tspan") {
      d.setAttribute("font-size", cs.fontSize);
      d.setAttribute("font-family", cs.fontFamily);
      d.setAttribute("font-weight", cs.fontWeight);
    }
  }
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const c = document.createElement("canvas");
        c.width = w * scale;
        c.height = h * scale;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
