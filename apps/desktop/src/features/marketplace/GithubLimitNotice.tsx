/**
 * GitHub's signed-out rate limit, as one floating icon.
 *
 * GitHub allows 60 requests an hour per IP without a sign-in, shared by
 * everything Studio does, and an unauthenticated `304` still costs one. Most
 * of the marketplace does not need the API at all (the catalog mirror, and
 * release reads that fall back to github.com), but when the allowance runs out
 * and something still does, this is where it says so and offers the fix: a
 * token, which raises it to 5,000. Everything lives behind the icon — a dot
 * on it says the allowance is spent (or a token is connected); the panel
 * opens on click and closes on a click outside or Escape.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Github, Loader2, X } from "lucide-react";
import { ipc, errorMessage, type GithubStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export function GithubLimitNotice({
  status,
  onChange,
  onOpenExternal,
}: {
  status: GithubStatus | null;
  onChange: (next: GithubStatus) => void;
  onOpenExternal: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!status) return null;
  const spent = (status.remaining ?? 1) === 0;
  const minutes = status.resetsInSecs != null ? Math.ceil(status.resetsInSecs / 60) : null;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      onChange(await ipc.githubConnect(token.trim()));
      setToken("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div className="w-[380px] max-w-[calc(100vw-40px)] rounded-xl border border-border bg-panel p-4 shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <Github className="h-4 w-4 text-foreground" />
            <span className="flex-1 text-[13px] font-semibold text-foreground">GitHub access</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {status.connected ? (
            <div className="grid gap-2 text-[12.5px]">
              <p className="flex items-center gap-2 text-foreground">
                <Check className="h-4 w-4 text-primary" />
                Signed in{status.login ? ` as ${status.login}` : ""} · {status.remaining ?? "?"} of {status.limit ?? "?"} requests left this hour.
              </p>
              <button
                onClick={() => void ipc.githubDisconnect().then(onChange).catch(() => undefined)}
                className="justify-self-start text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5">
              <p className="text-[12.5px] leading-relaxed text-foreground">
                {spent
                  ? `The hourly limit for this machine is used up${minutes != null ? ` and refills in about ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}. Descriptions, versions and installs that still need GitHub wait until then.`
                  : `${status.remaining ?? "?"} of ${status.limit ?? 60} signed-out requests left this hour, shared by everything Studio asks GitHub.`}
              </p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                A token raises it to 5,000 an hour. Studio reads only public information, so the token needs{" "}
                <strong className="font-semibold text-foreground">no scopes</strong> — leave every box unticked. It is encrypted on this machine and sent only to github.com.
              </p>
              <button
                onClick={() => onOpenExternal(status.tokenUrl)}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-medium text-foreground hover:bg-secondary"
              >
                Create a token on GitHub <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && token.trim() && !busy) void connect();
                  }}
                  placeholder="Paste the token"
                  aria-label="GitHub token"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-editor px-3 font-mono text-[12px] text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => void connect()}
                  disabled={!token.trim() || busy}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold",
                    !token.trim() || busy ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85",
                  )}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Connect
                </button>
              </div>
              {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            </div>
          )}
        </div>
      ) : null}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={status.connected ? "GitHub: signed in" : spent ? "GitHub: hourly limit used up" : "GitHub access"}
        title={status.connected ? `Signed in to GitHub${status.login ? ` as ${status.login}` : ""}` : spent ? "GitHub's hourly limit is used up" : "GitHub access"}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-foreground shadow-lg hover:bg-secondary"
      >
        <Github className="h-4.5 w-4.5" />
        {status.connected || spent ? (
          <span className={cn("absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel", status.connected ? "bg-primary" : "bg-destructive")} />
        ) : null}
      </button>
    </div>
  );
}
