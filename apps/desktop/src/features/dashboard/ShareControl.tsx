// The dashboard Share control: start a read-only public (cloudflared) or
// on-machine link, keep it fresh by re-publishing the rendered snapshot on an
// interval, and manage it (copy / rotate / stop). The exposure notice is shown
// before any link exists, because a public share puts data on the internet.

import { useEffect, useRef, useState } from "react";
import { Share2, Copy, RotateCw, X, Check, Globe, Monitor, AlertTriangle, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardDoc } from "./model";
import type { DashConn } from "./useWidgetData";
import type { ExportFormat } from "./export-dashboard";
import { startShare, publishShare, rotateShare, stopShare, shareUrl, type ShareSession, type ShareMode } from "./share-manager";

const PUBLISH_INTERVAL_MS = 15_000;

export function ShareControl({ doc, conn, onExport }: { doc: DashboardDoc; conn: DashConn; onExport?: (format: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ShareSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("Starting…");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote((n) => (n === msg ? null : n)), 2500);
  };

  // Latest doc/conn for the publish loop without re-arming it each render.
  const docRef = useRef(doc);
  docRef.current = doc;
  const connRef = useRef(conn);
  connRef.current = conn;

  // Re-publish the snapshot on an interval while a share is live.
  useEffect(() => {
    if (!session) return;
    const tick = () => void publishShare(session.id, docRef.current, connRef.current).catch(() => {});
    const t = setInterval(tick, PUBLISH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [session]);

  const begin = async (mode: ShareMode) => {
    setBusy(true);
    setBusyMsg(mode === "public" ? "Setting up public sharing (first use downloads cloudflared, ~50 MB)…" : "Starting…");
    setError(null);
    try {
      setSession(await startShare(doc.id, doc, conn, mode));
      flash(mode === "public" ? "Public link is live." : "Local link is live.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doRotate = async () => {
    if (!session) return;
    setBusy(true);
    try {
      setSession(await rotateShare(session));
      flash("New link generated — the old one no longer works.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doStop = async () => {
    if (!session) return;
    setBusy(true);
    const s = session;
    setSession(null);
    await stopShare(s).catch(() => {});
    setBusy(false);
  };

  const url = session ? shareUrl(session) : "";
  const copy = () => {
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Stop the share if the control unmounts (tab closed).
  useEffect(() => {
    return () => {
      if (session) void stopShare(session).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Share dashboard"
        className={cn("flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted", session ? "border-green-500/50 text-green-600" : "border-border text-foreground")}
      >
        {session ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> : <Share2 className="h-3.5 w-3.5" />}
        {session ? "Live" : "Share"}
      </button>

      {open ? (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-border bg-background p-3 shadow-lg">
          {note ? (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-green-500/10 p-1.5 text-[11px] text-green-600">
              <Check className="h-3.5 w-3.5 shrink-0" /> {note}
            </div>
          ) : null}
          {!session ? (
            <>
              {onExport ? (
                <div className="mb-2 border-b border-border pb-2">
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Download className="h-3 w-3" /> Download a copy</div>
                  <div className="flex gap-1">
                    {(["html", "md", "pdf"] as ExportFormat[]).map((f) => (
                      <button key={f} onClick={() => onExport(f)} className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] uppercase text-foreground hover:bg-muted">{f}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Live link</div>
              <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 p-2 text-[10.5px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>A shared link is read-only and secret, but a public link puts this dashboard's data on the internet until you stop it.</span>
              </div>
              <button disabled={busy} onClick={() => begin("public")} className="mb-1.5 flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[12px] hover:bg-muted disabled:opacity-50">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span><div className="font-medium">Public link</div><div className="text-[10.5px] text-muted-foreground">Anyone with the link · first use downloads cloudflared (~50 MB, one-time)</div></span>
              </button>
              <button disabled={busy} onClick={() => begin("local")} className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[12px] hover:bg-muted disabled:opacity-50">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span><div className="font-medium">This machine</div><div className="text-[10.5px] text-muted-foreground">localhost link (quick check)</div></span>
              </button>
              {busy ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{busyMsg}</span>
                </div>
              ) : null}
              {error ? <div className="mt-2 text-[11px] text-red-500">{error}</div> : null}
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live {session.mode === "public" ? "· public" : "· this machine"}
              </div>
              <div className="mb-2 flex items-center gap-1">
                <input readOnly value={url} className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground" onFocus={(e) => e.currentTarget.select()} />
                <button onClick={copy} title="Copy link" className="rounded-md border border-border p-1.5 hover:bg-muted">{copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </div>
              <div className="flex gap-1.5">
                <button disabled={busy} onClick={doRotate} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50" title="New link, old one stops working">
                  <RotateCw className="h-3.5 w-3.5" /> Rotate
                </button>
                <button disabled={busy} onClick={doStop} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" /> Stop
                </button>
              </div>
              <div className="mt-2 text-[10.5px] text-muted-foreground">Refreshes every 15s while this tab is open. Closing the app ends the share.</div>
              {error ? <div className="mt-2 text-[11px] text-red-500">{error}</div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
