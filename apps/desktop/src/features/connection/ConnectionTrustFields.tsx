// The connection form's encryption and sign-in rows: encryption mode, a pinned
// certificate fingerprint, a CA file, and how to sign in (password or an
// OpenID token). Kept apart from ConnectionPropertiesTab so it does not grow.

import { useState } from "react";
import { Check, ChevronDown, FileKey, Loader2, ShieldCheck, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage, ipc } from "@/lib/ipc";
import { AUTH_METHODS, ENCRYPTION_MODES, displayFingerprint, encryptionChoice, isSaasHost } from "@/lib/connect-flow";
import { checkHost, checkPort } from "@/lib/dsn";

export type TrustDraft = { host: string; port: string; sslMode: string; fingerprint: string; sslCa: string; authMethod: string };

const ROW = "flex items-center gap-3 border-b border-border/60 py-2 last:border-0";
const LABEL = "w-56 shrink-0 text-[12px] text-muted-foreground";
const INPUT =
  "h-8 w-full max-w-md rounded-md border border-border bg-secondary/30 px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60 disabled:opacity-50";
const BUTTON =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 min-w-72 items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 text-[12.5px] text-foreground hover:border-muted-foreground">
            {options.find((o) => o.value === value)?.label ?? value}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
              {o.value === value ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />} {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** How to sign in; the secret field's label follows it. */
export function SignInMethodRow({ draft, onChange }: { draft: TrustDraft; onChange: (patch: Partial<TrustDraft>) => void }) {
  return (
    <>
      <Choice label="Sign in with" value={draft.authMethod || "password"} options={AUTH_METHODS} onChange={(v) => onChange({ authMethod: v })} />
      {isSaasHost(draft.host) ? (
        <p className="border-b border-border/60 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Exasol SaaS: sign in with your database user and a personal access token as the password (it starts with exa_pat_). This machine's IP address must be on the cluster's allow list in the SaaS console.
        </p>
      ) : null}
    </>
  );
}

/** Encryption, certificate pinning and the CA file. */
export function ConnectionTrustFields({ draft, onChange }: { draft: TrustDraft; onChange: (patch: Partial<TrustDraft>) => void }) {
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const pinned = draft.fingerprint.trim().length > 0;

  async function readFromServer() {
    setReading(true);
    setReadError(null);
    try {
      onChange({ fingerprint: await ipc.serverCertificate(draft.host.trim(), Number(draft.port) || 8563) });
    } catch (e) {
      setReadError(errorMessage(e));
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <Choice label="Encryption" value={encryptionChoice(draft.sslMode)} options={ENCRYPTION_MODES} onChange={(v) => onChange({ sslMode: v })} />
      <div className={ROW}>
        <span className={LABEL}>Certificate fingerprint</span>
        <input
          value={draft.fingerprint}
          placeholder="SHA-256, optional — pins this exact certificate"
          spellCheck={false}
          onChange={(e) => onChange({ fingerprint: e.target.value })}
          className={INPUT}
        />
        <button onClick={() => void readFromServer()} disabled={reading || !draft.host.trim()} className={BUTTON} title="Read the certificate the server presents now">
          {reading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Read from server
        </button>
        {pinned ? (
          <button onClick={() => onChange({ fingerprint: "" })} className={BUTTON} aria-label="Remove the pin">
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <p className="border-b border-border/60 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {readError
          ? readError
          : pinned
            ? `Pinned: the server must present exactly this certificate (${displayFingerprint(draft.fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase()).slice(0, 19)}…). Compare it with the fingerprint your administrator gives you.`
            : "Without a pin the certificate must be signed by an authority this machine trusts. Exasol's own self-signed certificate is offered for trust on the first connect."}
      </p>
      <div className={ROW}>
        <span className={LABEL}>CA certificate file</span>
        <input
          value={draft.sslCa}
          placeholder={pinned ? "Not used — the pinned certificate replaces it" : "Optional — a PEM file with your CA"}
          disabled={pinned}
          spellCheck={false}
          onChange={(e) => onChange({ sslCa: e.target.value })}
          className={INPUT}
        />
        <button
          disabled={pinned}
          onClick={() => void ipc.pickCaFile().then((path) => path && onChange({ sslCa: path })).catch(() => undefined)}
          className={BUTTON}
        >
          <FileKey className="h-3 w-3" /> Browse
        </button>
      </div>
    </>
  );
}

/** Under host and port: the nodes a range reaches, or what is wrong. */
export function AddressNote({ host, port }: { host: string; port: string }) {
  if (!host.trim() && !port.trim()) return null;
  const h = checkHost(host);
  const p = checkPort(port);
  const problem = !h.ok ? h.error : !p.ok ? p.error : null;
  const nodes = h.ok && h.hosts.length > 1 ? `${h.hosts.length} nodes: ${h.hosts[0]} … ${h.hosts[h.hosts.length - 1]}` : null;
  if (!problem && !nodes) {
    return (
      <p className="border-b border-border/60 py-2 text-[11px] text-muted-foreground">
        Paste a JDBC URL, an exa:// URL or a pyexasol DSN into the server field to fill the form. Consecutive nodes: db1..4.example.com.
      </p>
    );
  }
  return <p className={`border-b border-border/60 py-2 text-[11px] ${problem ? "text-destructive" : "text-muted-foreground"}`}>{problem ?? nodes}</p>;
}
