// Asks for the password (or token) when a saved connection has none stored:
// "this session only", "clear at disconnect", or a lost keychain item. It
// registers itself as ipc.connect's prompt, so every connect path asks.

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ipc, setSecretPrompt, type SecretAnswer } from "@/lib/ipc";
import { AUTH_METHODS } from "@/lib/connect-flow";
import { loadConnSettings } from "@/features/connection/ConnectionPropertiesTab";

type Ask = { name: string; label: string; canRemember: boolean; resolve: (a: SecretAnswer | null) => void };

export function ConnectPasswordDialog() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // One question at a time; two connects to the same profile share one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const asking = useRef(new Map<string, Promise<SecretAnswer | null>>());

  useEffect(() => {
    const askOne = async ({ profileId }: { profileId: string }) => {
      const [profiles, settings] = await Promise.all([ipc.listConnectionProfiles().catch(() => []), loadConnSettings(profileId)]);
      const p = profiles.find((x) => x.id === profileId);
      const label = AUTH_METHODS.find((m) => m.value === (p?.authMethod ?? "password"))?.secret ?? "Password";
      return new Promise<SecretAnswer | null>((resolve) => {
        setSecret("");
        setRemember(false);
        setAsk({ name: p?.name ?? "this connection", label, canRemember: settings.auth.passwordPolicy === "save", resolve });
      });
    };
    setSecretPrompt((req) => {
      const pending = asking.current.get(req.profileId);
      if (pending) return pending;
      const next = queue.current.then(() => askOne(req));
      queue.current = next.catch(() => undefined);
      asking.current.set(req.profileId, next);
      void next.finally(() => asking.current.delete(req.profileId));
      return next;
    });
    return () => setSecretPrompt(null);
  }, []);

  const answer = (a: SecretAnswer | null) => {
    ask?.resolve(a);
    setAsk(null);
    setSecret("");
  };

  return (
    <Dialog open={!!ask} onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => (e.preventDefault(), input.current?.focus())}>
        <DialogHeader>
          <DialogTitle>Sign in to {ask?.name}</DialogTitle>
          <DialogDescription>No {ask?.label.toLowerCase()} is saved for this connection.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (secret) answer({ secret, remember });
          }}
          className="space-y-3"
        >
          <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5">
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={input}
              type="password"
              value={secret}
              placeholder={ask?.label}
              aria-label={ask?.label}
              onChange={(e) => setSecret(e.target.value)}
              className="h-8 w-full bg-transparent font-mono text-[12.5px] text-foreground outline-none"
            />
          </label>
          {ask?.canRemember ? (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save it for next time
            </label>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">Kept for this session only, as this connection's settings say.</p>
          )}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => answer(null)} className="h-8 rounded-md border border-border px-3 text-[12.5px] text-foreground hover:bg-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!secret} className="h-8 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40">
              Connect
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
