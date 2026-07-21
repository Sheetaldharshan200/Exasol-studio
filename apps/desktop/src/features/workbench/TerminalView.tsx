import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

/** One real PTY-backed terminal (xterm.js ⇄ Rust portable-pty). */
export function TerminalView({ ptyId, active }: { ptyId: number; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const css = getComputedStyle(document.documentElement);
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: css.getPropertyValue("--editor").trim() || "#0a0a0b",
        foreground: css.getPropertyValue("--foreground").trim() || "#f4f4f5",
        cursor: css.getPropertyValue("--primary").trim() || "#5fc33b",
        selectionBackground: "rgba(95, 195, 59, 0.25)",
      },
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
    let unData: UnlistenFn | undefined;
    let unExit: UnlistenFn | undefined;
    void listen<{ id: number; data: string }>("term-data", (e) => {
      if (e.payload.id === ptyId) term.write(e.payload.data);
    }).then((u) => (unData = u));
    void listen<{ id: number }>("term-exit", (e) => {
      if (e.payload.id === ptyId) term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
    }).then((u) => (unExit = u));

    const ro = new ResizeObserver(safeFit);
    ro.observe(hostRef.current);
    return () => {
      ro.disconnect();
      onData.dispose();
      unData?.();
      unExit?.();
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
