/**
 * The way out of GitHub's signed-out rate limit.
 *
 * GitHub allows 60 requests an hour per IP without a sign-in, shared by
 * everything Studio does, and an unauthenticated `304` still costs one — so
 * there is no caching trick that avoids it. Most of the marketplace does not
 * need the API at all (the catalog mirror, and release reads that fall back to
 * github.com), but when the allowance runs out and something still does, this
 * says so plainly and offers the fix: a token, which raises it to 5,000.
 *
 * It appears only when it is useful — the allowance is spent and no token is
 * connected — so nobody is asked to authenticate to browse.
 */
import { useState } from "react";
import { ExternalLink, Check, Loader2 } from "lucide-react";
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
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status) return null;
  // Nothing to say while requests are still available and nobody signed in.
  const spent = (status.remaining ?? 1) === 0;
  if (!status.connected && !spent) return null;

  if (status.connected) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3 text-[13px]">
        <Check className="h-4 w-4 text-primary" />
        <span className="text-foreground">
          Signed in to GitHub{status.login ? ` as ${status.login}` : ""} — {status.remaining ?? "?"} of {status.limit ?? "?"} requests left this hour.
        </span>
        <button
          onClick={() => void ipc.githubDisconnect().then(onChange).catch(() => undefined)}
          className="ml-auto text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Disconnect
        </button>
      </div>
    );
  }

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
    <div className="grid gap-3 rounded-xl border border-border bg-panel px-4 py-3.5">
      <p className="text-[13px] leading-relaxed text-foreground">
        GitHub's hourly limit for this machine is used up
        {minutes != null ? `, and refills in about ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}. It allows{" "}
        {status.limit ?? 60} requests an hour without a sign-in. Descriptions, versions and installs that still need
        GitHub will not load until then.
      </p>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Connecting a token raises it to 5,000 an hour. Studio only reads public information, so the token needs{" "}
        <strong className="font-semibold text-foreground">no scopes at all</strong> — leave every box unticked. It is
        encrypted on this machine and sent only to github.com.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onOpenExternal(status.tokenUrl)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
        >
          Create a token on GitHub <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && token.trim() && !busy) void connect(); }}
          placeholder="Paste the token here"
          aria-label="GitHub token"
          className="h-9 min-w-[240px] flex-1 rounded-md border border-border bg-editor px-3 font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground"
        />
        <button
          onClick={() => void connect()}
          disabled={!token.trim() || busy}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[12.5px] font-semibold",
            !token.trim() || busy ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85",
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Connect
        </button>
      </div>
      {error ? <p className="text-[12.5px] text-destructive">{error}</p> : null}
    </div>
  );
}
