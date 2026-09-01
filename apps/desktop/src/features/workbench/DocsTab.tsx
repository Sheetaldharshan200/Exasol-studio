import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { agent } from "@/lib/agent-client";
import { isTauri } from "@/lib/ipc";

/**
 * The documentation, rendered INSIDE the app: an iframe of the docs site the
 * exa engine serves (/docs/studio — same pages as the public site, offline).
 * The exa engine's own notebook deliberately opens in the browser instead:
 * it's a reference for the CLI, not an app surface.
 */
export function DocsTab({ path }: { path?: string }) {
  const [base, setBase] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Follow the APP's theme, live: the docs run in an iframe (cross-origin in
  // the desktop shell), so the theme travels as a query param and a toggle
  // reloads the frame with the other one.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!isTauri()) {
        // Web build: the same server serves the app AND the docs.
        if (alive) setBase("");
        return;
      }
      try {
        const status = await agent.engine.status();
        if (alive && status?.port) setBase(`http://127.0.0.1:${status.port}`);
        else if (alive) setFailed(true);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const docsUrl =
    base === null
      ? null
      : (() => {
          // Paths under "exa/…" open the ENGINE's docs section (e.g. the
          // plugin guide at /docs/exa/develop/plugins); everything else stays
          // under the Studio docs.
          const p = (path ?? "").replace(/^\/+/, "");
          const section = p.startsWith("exa/") ? `/docs/${p}` : `/docs/studio${p ? `/${p}` : ""}`;
          return `${base}${section}?theme=${dark ? "dark" : "light"}`;
        })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="min-h-0 flex-1">
        {failed ? (
          <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">
            The docs are served by the exa engine, which isn't running yet — start it from the assistant panel, then reopen this tab.
          </p>
        ) : docsUrl === null ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <iframe key={docsUrl} src={docsUrl} title="Exasol Studio documentation" className="h-full w-full border-0 bg-editor" />
        )}
      </div>
    </div>
  );
}
