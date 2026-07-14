import { useState } from "react";
import { AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const MIN_LEN = 10;

function strengthOf(pw: string): { ok: boolean; checks: { label: string; ok: boolean }[] } {
  const checks = [
    { label: `At least ${MIN_LEN} characters`, ok: pw.length >= MIN_LEN },
    { label: "A letter", ok: /[a-zA-Z]/.test(pw) },
    { label: "A number", ok: /[0-9]/.test(pw) },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

function Shell({ icon: Icon, title, subtitle, children }: { icon: typeof Lock; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="hero-surface flex h-screen w-full items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLoader size={64} />
          <div className="mt-4 flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h1 className="text-[17px] font-bold">{title}</h1>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, autoFocus, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="h-10 w-full rounded-lg border border-border bg-editor px-3 pr-10 text-[13px] text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
      <button onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** First-run master-password setup → then reveal the 5 recovery keys once. */
export function VaultSetup({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const strength = strengthOf(pw);
  const canSubmit = strength.ok && pw === confirm && !busy;

  async function create() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const recovery = await ipc.vaultSetup(pw);
      setCodes(recovery);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    const text = codes.join("\n");
    return (
      <Shell icon={KeyRound} title="Save your recovery keys" subtitle="The only way back in if you forget your master password.">
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
          <p className="mb-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            These 5 one-time keys are shown once and never again. Store them somewhere safe — each can reset your password.
          </p>
          <div className="grid gap-1.5 rounded-lg bg-editor p-2.5 font-mono text-[12.5px] text-foreground">
            {codes.map((c, i) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-4 text-right text-muted-foreground">{i + 1}</span>
                <span className="tracking-wide">{c}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-2 flex items-center gap-1.5 text-[12px] text-primary hover:underline"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy all"}
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-foreground">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[color:hsl(var(--primary))]" />
          I've saved my recovery keys somewhere safe.
        </label>
        <button
          onClick={onDone}
          disabled={!saved}
          className="cta-glow mt-4 h-11 w-full rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Continue
        </button>
      </Shell>
    );
  }

  return (
    <Shell icon={ShieldCheck} title="Set a master password" subtitle="It encrypts your saved connection passwords on this device.">
      <div className="space-y-3">
        <PasswordInput value={pw} onChange={setPw} placeholder="Master password" autoFocus />
        <PasswordInput value={confirm} onChange={setConfirm} placeholder="Confirm password" onEnter={create} />
        <div className="grid gap-1 rounded-lg border border-border bg-panel/50 p-2.5">
          {strength.checks.map((c) => (
            <div key={c.label} className={cn("flex items-center gap-1.5 text-[11.5px]", c.ok ? "text-primary" : "text-muted-foreground")}>
              <Check className={cn("h-3.5 w-3.5", c.ok ? "opacity-100" : "opacity-30")} /> {c.label}
            </div>
          ))}
          {confirm && pw !== confirm ? <div className="text-[11.5px] text-destructive">Passwords don't match.</div> : null}
        </div>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <button
          onClick={create}
          disabled={!canSubmit}
          className="cta-glow flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Create master password
        </button>
      </div>
    </Shell>
  );
}

/** Returning-user unlock, with a recovery-key reset path. */
export function VaultUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [mode, setMode] = useState<"unlock" | "recover">("unlock");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // recover
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const strength = strengthOf(newPw);

  async function unlock() {
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.vaultUnlock(pw);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    if (!code.trim() || !strength.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.vaultRecover(code.trim(), newPw);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "recover") {
    return (
      <Shell icon={KeyRound} title="Reset with a recovery key" subtitle="Enter one of your 5 recovery keys and choose a new password.">
        <div className="space-y-3">
          <input
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            className="h-10 w-full rounded-lg border border-border bg-editor px-3 font-mono text-[13px] tracking-wide text-foreground outline-none focus:border-primary/50"
          />
          <PasswordInput value={newPw} onChange={setNewPw} placeholder="New master password" />
          <div className="grid gap-1 rounded-lg border border-border bg-panel/50 p-2.5">
            {strength.checks.map((c) => (
              <div key={c.label} className={cn("flex items-center gap-1.5 text-[11.5px]", c.ok ? "text-primary" : "text-muted-foreground")}>
                <Check className={cn("h-3.5 w-3.5", c.ok ? "opacity-100" : "opacity-30")} /> {c.label}
              </div>
            ))}
          </div>
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          <button
            onClick={recover}
            disabled={!code.trim() || !strength.ok || busy}
            className="cta-glow flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Reset password & unlock
          </button>
          <button onClick={() => { setMode("unlock"); setError(null); }} className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground">
            Back to unlock
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={Lock} title="Unlock Exasol Studio" subtitle="Enter your master password to continue.">
      <div className="space-y-3">
        <PasswordInput value={pw} onChange={setPw} placeholder="Master password" autoFocus onEnter={unlock} />
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <button
          onClick={unlock}
          disabled={!pw || busy}
          className="cta-glow flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Unlock
        </button>
        <button onClick={() => { setMode("recover"); setError(null); }} className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground">
          Forgot password? Use a recovery key
        </button>
      </div>
    </Shell>
  );
}
