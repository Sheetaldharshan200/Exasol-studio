import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { agent } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
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

  const openExternal = (url: string) => {
    if (isTauri()) void ipc.openExternal(url).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank");
  };
  const docsUrl = base === null ? null : `${base}/docs/studio${path ? `/${path.replace(/^\/+/, "")}` : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <BookOpen className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-medium text-foreground">Documentation</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => docsUrl && openExternal(docsUrl)}
            disabled={!docsUrl}
            className="flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <ExternalLink className="h-3 w-3" /> Open in browser
          </button>
          <button
            onClick={() => base !== null && openExternal(`${base}/docs/exa`)}
            disabled={base === null}
            title="The exa engine's own docs — opens in your browser"
            className="flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            exa docs <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </header>
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
          <iframe src={docsUrl} title="Exasol Studio documentation" className="h-full w-full border-0 bg-editor" />
        )}
      </div>
    </div>
  );
}
