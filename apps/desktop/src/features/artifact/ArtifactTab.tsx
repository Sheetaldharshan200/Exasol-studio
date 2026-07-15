import { useEffect, useRef } from "react";

/** Renders an agent-created HTML artifact in a sandboxed iframe (scripts
 *  allowed, but no same-origin access — it can't touch the app). */
export function ArtifactTab({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcdoc = html;
  }, [html]);
  return (
    <div className="h-full w-full bg-white">
      <iframe ref={ref} title="Artifact" sandbox="allow-scripts" className="h-full w-full border-0" />
    </div>
  );
}
