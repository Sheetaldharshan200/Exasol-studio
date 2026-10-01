// How the connection reaches its database: directly, through an SSH tunnel,
// or through an HTTP / SOCKS5 proxy. Secrets typed here are sealed by the
// backend and never shown again; a blank one keeps what is saved.

import { Check, ChevronDown, FileKey } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ipc, type NetworkSettings, type ProxySettings, type SshSettings } from "@/lib/ipc";

const ROW = "flex items-center gap-3 border-b border-border/60 py-2 last:border-0";
const LABEL = "w-56 shrink-0 text-[12px] text-muted-foreground";
const INPUT =
  "h-8 w-full max-w-md rounded-md border border-border bg-secondary/30 px-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60";
const HINT = "border-b border-border/60 py-2 text-[11px] leading-relaxed text-muted-foreground";

const NEW_SSH: SshSettings = { host: "", port: null, user: null, auth: "agent", keyPath: null, jump: null, hostKey: "ask", keepaliveSecs: 30, secret: "" };
const NEW_PROXY: ProxySettings = { kind: "socks5", host: "", port: 1080, user: null, secret: "" };

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 min-w-60 items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 text-[12.5px] text-foreground hover:border-muted-foreground">
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

function Field({ label, value, placeholder, type, onChange, children }: { label: string; value: string; placeholder?: string; type?: string; onChange: (v: string) => void; children?: React.ReactNode }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <input type={type ?? "text"} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      {children}
    </div>
  );
}

const num = (v: string) => (v.trim() ? Number(v) || 0 : null);

export function ConnectionNetworkFields({ network, isNew, onChange }: { network: NetworkSettings | null | undefined; isNew: boolean; onChange: (n: NetworkSettings | null) => void }) {
  const route = network?.ssh ? "ssh" : network?.proxy ? "proxy" : "direct";
  const ssh = network?.ssh;
  const proxy = network?.proxy;
  const setSsh = (patch: Partial<SshSettings>) => onChange({ ssh: { ...(ssh ?? NEW_SSH), ...patch } });
  const setProxy = (patch: Partial<ProxySettings>) => onChange({ proxy: { ...(proxy ?? NEW_PROXY), ...patch } });
  const keep = isNew ? undefined : "Unchanged — type to replace";

  return (
    <>
      <Choice
        label="Reach the database"
        value={route}
        options={[
          { value: "direct", label: "Directly" },
          { value: "ssh", label: "Through an SSH tunnel" },
          { value: "proxy", label: "Through a proxy" },
        ]}
        onChange={(v) => onChange(v === "ssh" ? { ssh: ssh ?? NEW_SSH } : v === "proxy" ? { proxy: proxy ?? NEW_PROXY } : null)}
      />
      {ssh ? (
        <>
          <Field label="SSH server" value={ssh.host} placeholder="bastion.example.com, or a Host from ~/.ssh/config" onChange={(v) => setSsh({ host: v })} />
          <Field label="SSH port" value={ssh.port ? String(ssh.port) : ""} placeholder="22, or as ~/.ssh/config says" onChange={(v) => setSsh({ port: num(v) })} />
          <Field label="SSH user" value={ssh.user ?? ""} placeholder="as ~/.ssh/config says" onChange={(v) => setSsh({ user: v || null })} />
          <Choice
            label="SSH sign-in"
            value={ssh.auth as "agent" | "key" | "password"}
            options={[
              { value: "agent", label: "SSH agent" },
              { value: "key", label: "Private key file" },
              { value: "password", label: "Password" },
            ]}
            onChange={(v) => setSsh({ auth: v })}
          />
          {ssh.auth === "key" ? (
            <Field label="Private key" value={ssh.keyPath ?? ""} placeholder="~/.ssh/id_ed25519" onChange={(v) => setSsh({ keyPath: v || null })}>
              <button
                onClick={() => void ipc.pickSshKey().then((p) => p && setSsh({ keyPath: p })).catch(() => undefined)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <FileKey className="h-3 w-3" /> Browse
              </button>
            </Field>
          ) : null}
          {ssh.auth !== "agent" ? (
            <Field
              label={ssh.auth === "key" ? "Key passphrase" : "SSH password"}
              type="password"
              value={ssh.secret}
              placeholder={keep ?? (ssh.auth === "key" ? "Leave empty for a key without one" : "Password")}
              onChange={(v) => setSsh({ secret: v })}
            />
          ) : null}
          <Field label="Jump host" value={ssh.jump ?? ""} placeholder="Optional: user@gateway:22" onChange={(v) => setSsh({ jump: v || null })} />
          <Choice
            label="Host key"
            value={ssh.hostKey as "ask" | "accept_new" | "strict"}
            options={[
              { value: "ask", label: "Ask before trusting a new server" },
              { value: "accept_new", label: "Accept new servers, refuse changed keys" },
              { value: "strict", label: "Only servers in known_hosts" },
            ]}
            onChange={(v) => setSsh({ hostKey: v })}
          />
          <Field label="Keep-alive (seconds)" value={String(ssh.keepaliveSecs)} placeholder="0 = off" onChange={(v) => setSsh({ keepaliveSecs: Math.max(0, Number(v) || 0) })} />
          <p className={HINT}>
            The database host and port above are as the SSH server sees them. Studio runs your system's ssh, so ~/.ssh/config (including any ProxyCommand), the agent and known_hosts apply. The tunnel is shared by all tabs of this connection; while connected, it listens on this machine only.
          </p>
        </>
      ) : null}
      {proxy ? (
        <>
          <Choice
            label="Proxy type"
            value={proxy.kind}
            options={[
              { value: "socks5", label: "SOCKS5" },
              { value: "http", label: "HTTP (CONNECT)" },
            ]}
            onChange={(v) => setProxy({ kind: v })}
          />
          <Field label="Proxy host" value={proxy.host} placeholder="proxy.example.com" onChange={(v) => setProxy({ host: v })} />
          <Field label="Proxy port" value={proxy.port ? String(proxy.port) : ""} placeholder={proxy.kind === "http" ? "3128" : "1080"} onChange={(v) => setProxy({ port: Number(v) || 0 })} />
          <Field label="Proxy user" value={proxy.user ?? ""} placeholder="Optional" onChange={(v) => setProxy({ user: v || null })} />
          {proxy.user ? <Field label="Proxy password" type="password" value={proxy.secret} placeholder={keep ?? "Password"} onChange={(v) => setProxy({ secret: v })} /> : null}
          <p className={HINT}>
            TLS to the database is end to end: the proxy only relays encrypted bytes. A proxy user and password are sent to the proxy unencrypted, as SOCKS5 and HTTP CONNECT do — use them only on a network you trust.
          </p>
        </>
      ) : null}
    </>
  );
}
