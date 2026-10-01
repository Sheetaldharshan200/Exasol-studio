// Commit / Roll back / Cancel — asked whenever closing a tab, disconnecting or
// quitting would end a transaction with uncommitted changes. Studio never
// decides this on its own.

import { Check, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PendingClose = {
  title: string;
  question: string;
  recent: string[];
  onChoose: (choice: "commit" | "rollback" | "cancel") => void;
};

export function UncommittedDialog({ pending }: { pending: PendingClose | null }) {
  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && pending?.onChoose("cancel")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title ?? "Uncommitted changes"}</DialogTitle>
          <DialogDescription>{pending?.question}</DialogDescription>
        </DialogHeader>
        {pending?.recent.length ? (
          <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
            {pending.recent.map((s, i) => (
              <li key={i} className="truncate" title={s}>
                {s}
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="gap-2">
          <button onClick={() => pending?.onChoose("cancel")} className="h-8 rounded-md border border-border px-3 text-[12.5px] text-foreground hover:bg-secondary">
            Cancel
          </button>
          <button onClick={() => pending?.onChoose("rollback")} className="flex h-8 items-center gap-1.5 rounded-md border border-destructive/50 px-3 text-[12.5px] text-destructive hover:bg-destructive/10">
            <RotateCcw className="h-3.5 w-3.5" /> Roll back
          </button>
          <button onClick={() => pending?.onChoose("commit")} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85">
            <Check className="h-3.5 w-3.5" /> Commit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
