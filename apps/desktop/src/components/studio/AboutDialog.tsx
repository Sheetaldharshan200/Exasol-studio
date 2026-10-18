// About Exasol Studio: versions and the system, the logs folder, and a
// diagnostics text for bug reports (lib/diagnostics.ts).

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExasolMark } from "@/components/brand/ExasolMark";
import { errorMessage, ipc, isTauri, type AboutInfo } from "@/lib/ipc";
import { diagnosticsText } from "@/lib/diagnostics";

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    ipc.aboutInfo().then(setInfo).catch(() => setInfo(null));
  }, [open]);

  const copy = async () => {
    if (!info) return;
    const log = await ipc.recentLog(40).catch(() => "");
    try {
      await navigator.clipboard.writeText(diagnosticsText(info, { userAgent: navigator.userAgent, log }));
      setStatus("Diagnostics copied");
    } catch (e) {
      setStatus(errorMessage(e));
    }
  };
  const rows: [string, string][] = info
    ? [
        ["Version", info.appVersion],
        ["Tauri", info.tauriVersion],
        ["System", [info.os, info.arch].filter(Boolean).join(" ")],
        ["Logs", info.logsDir],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExasolMark size={18} /> Exasol Studio
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-foreground" title={v}>{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex items-center gap-2">
          {isTauri() ? (
            <button
              onClick={() => void ipc.openLogsDir().catch((e) => setStatus(errorMessage(e)))}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open logs
            </button>
          ) : null}
          <button
            onClick={() => void copy()}
            disabled={!info}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Copy diagnostics
          </button>
          {status ? (
            <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <Check className="h-3 w-3" /> {status}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">Diagnostics list versions, the system and the recent app log — no connection details or passwords.</p>
      </DialogContent>
    </Dialog>
  );
}
