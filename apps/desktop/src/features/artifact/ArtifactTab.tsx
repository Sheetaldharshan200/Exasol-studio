import { useEffect, useRef, useState } from "react";
import { Download, History } from "lucide-react";
import { artifacts } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * Renders an agent-created HTML artifact in a sandboxed iframe (scripts
 * allowed, no same-origin access — it can't touch the app). Header offers
 * Download and a gallery of past artifacts to reopen.
 */
export function ArtifactTab({
  title,
  html,
  onOpen,
}: {
  title: string;
  html: string;
  onOpen?: (id: string, title: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [list, setList] = useState<{ id: string; title: string; createdAt: number }[]>([]);

  useEffect(() => {
    if (ref.current) ref.current.srcdoc = html;
  }, [html]);

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, "_") || "artifact"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
        <span className="truncate text-[12.5px] font-medium text-foreground">{title}</span>
        <div className="relative ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              setShowGallery((v) => !v);
              if (!showGallery) void artifacts.list().then(setList).catch(() => setList([]));
            }}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground",
              showGallery && "text-foreground",
            )}
            title="Past artifacts"
          >
            <History className="h-3.5 w-3.5" /> Artifacts
          </button>
          <button
            onClick={download}
            className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] text-foreground hover:bg-secondary"
            title="Download HTML"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          {showGallery ? (
            <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
              {list.length === 0 ? (
                <p className="px-3 py-3 text-[11.5px] text-muted-foreground">No saved artifacts yet.</p>
              ) : (
                list.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setShowGallery(false);
                      onOpen?.(a.id, a.title);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{a.title}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-white">
        <iframe ref={ref} title="Artifact" sandbox="allow-scripts" className="h-full w-full border-0" />
      </div>
    </div>
  );
}
