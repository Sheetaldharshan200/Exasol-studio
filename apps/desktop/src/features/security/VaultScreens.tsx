import { useState } from "react";
import { ArrowRight, Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import { ExasolMark } from "@/components/brand/ExasolMark";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const MIN_LEN = 10;

function meets(pw: string) {
  return pw.length >= MIN_LEN && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

/** Minimal centered shell: small mark, tight title, no card chrome. */
function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-[320px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <ExasolMark className="h-9 w-9 text-primary" />
          <h1 className="mt-4 text-[19px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ value, onChange, placeholder, autoFocus, onEnter, mono }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void; mono?: boolean }) {
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
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-editor px-3 pr-9 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/12",
          mono && "font-mono tracking-wide",
        )}
      />
      <button onClick={() => setShow((s) => !s)} tabIndex={-1} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Submit({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** First-run master-password setup → reveal the 5 recovery keys once. */
export function VaultSetup({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const ok = meets(pw);
  const canSubmit = ok && pw === confirm && !busy;

  async function create() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      setCodes(await ipc.vaultSetup(pw));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    const text = codes.join("\n");
    const download = () => {
      const blob = new Blob([`Exasol Studio — recovery keys\nEach one can reset your master password once. Keep them safe.\n\n${codes.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n`], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "exasol-studio-recovery-keys.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    };
    return (
      <Shell title="Recovery keys" subtitle="Shown once. Any one resets your password if you forget it.">
        <div className="rounded-lg border border-border bg-editor p-3">
          <div className="grid gap-1.5 font-mono text-[12.5px]">
            {codes.map((c, i) => (
              <div key={c} className="flex items-center gap-2.5">
                <span className="w-3 text-right text-[10.5px] text-muted-foreground/70">{i + 1}</span>
                <span className="tracking-[0.06em] text-foreground">{c}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[12px]">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={download} className="flex items-center gap-1.5 text-primary hover:underline">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
        <label className="mt-5 flex items-center gap-2 text-[12px] text-foreground">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-3.5 w-3.5 accent-[color:hsl(var(--primary))]" />
          I've saved these somewhere safe.
        </label>
        <div className="mt-4">
          <Submit onClick={onDone} disabled={!saved}>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </Submit>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Set a master password" subtitle="It encrypts your saved connections. It's never stored.">
      <div className="space-y-2.5">
        <Field value={pw} onChange={setPw} placeholder="Master password" autoFocus />
        <Field value={confirm} onChange={setConfirm} placeholder="Confirm password" onEnter={create} />
        <p className={cn("flex items-center gap-1.5 pt-0.5 text-[11.5px]", ok ? "text-primary" : "text-muted-foreground")}>
          {ok ? <Check className="h-3.5 w-3.5" /> : null}
          10+ characters, with a letter and a number.
        </p>
        {confirm && pw !== confirm ? <p className="text-[11.5px] text-destructive">Passwords don't match.</p> : null}
        {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
        <div className="pt-1.5">
          <Submit onClick={create} disabled={!canSubmit}>
            {busy ? "Creating…" : "Continue"}
          </Submit>
        </div>
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
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const ok = meets(newPw);

  async function unlock() {
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.vaultUnlock(pw);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function recover() {
    if (!code.trim() || !ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.vaultRecover(code.trim(), newPw);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (mode === "recover") {
    return (
      <Shell title="Reset password" subtitle="Enter a recovery key and choose a new password.">
        <div className="space-y-2.5">
          <Field value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autoFocus mono />
          <Field value={newPw} onChange={setNewPw} placeholder="New master password" />
          <p className={cn("pt-0.5 text-[11.5px]", ok ? "text-primary" : "text-muted-foreground")}>10+ characters, with a letter and a number.</p>
          {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
          <div className="pt-1.5">
            <Submit onClick={recover} disabled={!code.trim() || !ok || busy}>
              {busy ? "Resetting…" : "Reset & unlock"}
            </Submit>
          </div>
          <button onClick={() => { setMode("unlock"); setError(null); }} className="w-full pt-0.5 text-center text-[11.5px] text-muted-foreground hover:text-foreground">
            Back
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Welcome back" subtitle="Enter your master password to continue.">
      <div className="space-y-2.5">
        <Field value={pw} onChange={setPw} placeholder="Master password" autoFocus onEnter={unlock} />
        {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
        <div className="pt-1.5">
          <Submit onClick={unlock} disabled={!pw || busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </Submit>
        </div>
        <button onClick={() => { setMode("recover"); setError(null); }} className="w-full pt-0.5 text-center text-[11.5px] text-muted-foreground hover:text-foreground">
          Forgot password?
        </button>
      </div>
    </Shell>
  );
}
