import { useEffect, useRef, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
let renderSeq = 0;

/** Lazy-load mermaid once and (re)theme it to the current app theme. */
async function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => m.default);
  }
  return mermaidReady;
}

/**
 * Renders a mermaid diagram from code to inline SVG. Theme follows the app's
 * light/dark; parse errors show inline so the author can fix the code.
 */
export function MermaidView({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(0);

  useEffect(() => {
    let alive = true;
    const token = ++ref.current;
    if (!code.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    (async () => {
      try {
        const mermaid = await getMermaid();
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", fontFamily: "inherit" });
        const { svg: out } = await mermaid.render(`mmd-${++renderSeq}`, code);
        if (alive && token === ref.current) {
          setSvg(out);
          setError(null);
        }
      } catch (e) {
        if (alive && token === ref.current) {
          setError(e instanceof Error ? e.message : String(e));
          setSvg("");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (error) {
    return <pre className="whitespace-pre-wrap px-3 py-2 font-mono text-[11px] text-destructive">{error}</pre>;
  }
  if (!svg) {
    return <p className="px-3 py-4 text-[12px] text-muted-foreground/60 italic">Empty diagram.</p>;
  }
  return <div className="mermaid-diagram flex justify-center overflow-auto px-3 py-3 [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
