import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { attachTermSink } from "@/lib/term-bus";
import "@xterm/xterm/css/xterm.css";

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.classList.contains("dark");
  return {
    background: css.getPropertyValue("--editor").trim() || (dark ? "#0a0a0b" : "#ffffff"),
    foreground: css.getPropertyValue("--foreground").trim() || (dark ? "#f4f4f5" : "#18181b"),
    cursor: css.getPropertyValue("--primary").trim() || "#5fc33b",
    cursorAccent: css.getPropertyValue("--editor").trim() || (dark ? "#0a0a0b" : "#ffffff"),
    selectionBackground: "rgba(95, 195, 59, 0.25)",
  };
}

/** One real PTY-backed terminal (xterm.js ⇄ Rust portable-pty). */
export function TerminalView({ ptyId, active }: { ptyId: number; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      allowProposedApi: true,
      theme: themeColors(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = () => {
      try {
        if (hostRef.current && hostRef.current.clientWidth > 0) {
          fit.fit();
          void invoke("term_resize", { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => undefined);
        }
      } catch {
        /* hidden */
      }
    };
    safeFit();

    const onData = term.onData((data) => {
      void invoke("term_write", { id: ptyId, data }).catch(() => undefined);
    });
    const detach = attachTermSink(ptyId, (data) => term.write(data));

    const ro = new ResizeObserver(safeFit);
    ro.observe(hostRef.current);
    // Light/dark toggle flips a class on <html>; re-read tokens live so a
    // terminal opened in one theme follows the switch.
    const mo = new MutationObserver(() => {
      term.options.theme = themeColors();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      ro.disconnect();
      onData.dispose();
      detach();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId]);

  // Refit + focus when this instance becomes the visible one.
  useEffect(() => {
    if (active) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          const t = termRef.current;
          if (t) void invoke("term_resize", { id: ptyId, cols: t.cols, rows: t.rows }).catch(() => undefined);
          termRef.current?.focus();
        } catch {
          /* hidden */
        }
      }, 30);
    }
  }, [active, ptyId]);

  return <div ref={hostRef} className="h-full w-full bg-editor px-2 pt-1" />;
}
