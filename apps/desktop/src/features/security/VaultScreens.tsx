import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Download, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { errorMessage, ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const MIN_LEN = 10;

function strengthOf(pw: string) {
  const checks = [
    { label: `${MIN_LEN}+ characters`, ok: pw.length >= MIN_LEN },
    { label: "A letter", ok: /[a-zA-Z]/.test(pw) },
    { label: "A number", ok: /[0-9]/.test(pw) },
  ];
  const bonus = pw.length >= 14 && /[^a-zA-Z0-9]/.test(pw);
  const passed = checks.filter((c) => c.ok).length;
  const score = passed + (bonus ? 1 : 0); // 0..4
  return { ok: checks.every((c) => c.ok), checks, score };
}

/** Shared centered layout: brand mark, heading, and a soft card. */
function Shell({ icon: Icon, title, subtitle, children }: { icon: typeof Lock; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="hero-surface flex h-screen w-full items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/12 blur-2xl" />
            <BrandLoader size={60} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h1 className="text-[18px] font-bold tracking-tight">{title}</h1>
          </div>
          <p className="mt-1 max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-border bg-panel/60 p-5 shadow-xl shadow-black/10 backdrop-blur-sm">{children}</div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, value, onChange, placeholder, autoFocus, onEnter, mono }: { icon: typeof Lock; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onEnter?: () => void; mono?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-editor pl-9 pr-10 text-[13.5px] text-foreground outline-none transition-shadow focus:border-primary/50 focus:ring-2 focus:ring-primary/15",
          mono && "font-mono tracking-wide",
        )}
      />
      <button onClick={() => setShow((s) => !s)} tabIndex={-1} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function StrengthBar({ score }: { score: number }) {
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-primary/70", "bg-primary"];
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? colors[score] : "bg-border")} />
        ))}
      </div>
      <span className="w-16 text-right text-[10.5px] text-muted-foreground">{labels[score]}</span>
    </div>
  );
}

function PrimaryButton({ onClick, disabled, full = true, children }: { onClick: () => void; disabled?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "cta-glow flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
        full ? "w-full" : "px-10",
      )}
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
  const strength = strengthOf(pw);
  const canSubmit = strength.ok && pw === confirm && !busy;

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
      const blob = new Blob([`Exasol Studio — recovery keys\nKeep these safe. Each one can reset your master password once.\n\n${codes.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n`], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "exasol-studio-recovery-keys.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    };
    return (
      <Shell icon={KeyRound} title="Save your recovery keys" subtitle="The only way back in if you forget your master password.">
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
          Shown once, never again. Each key can reset your password a single time.
        </div>
        <div className="mt-3 grid gap-1.5 rounded-xl border border-border bg-editor p-3 font-mono text-[13px]">
          {codes.map((c, i) => (
            <div key={c} className="flex items-center gap-2.5">
              <span className="w-4 text-right text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="tracking-[0.08em] text-foreground">{c}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-4 text-[12px]">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(text).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy all"}
          </button>
          <button onClick={download} className="flex items-center gap-1.5 text-primary hover:underline">
            <Download className="h-3.5 w-3.5" /> Download .txt
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-[12.5px] text-foreground">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-[color:hsl(var(--primary))]" />
          I've saved my recovery keys somewhere safe.
        </label>
        <div className="mt-4">
          <PrimaryButton onClick={onDone} disabled={!saved}>
            Continue <ArrowRight className="h-4 w-4" />
          </PrimaryButton>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={ShieldCheck} title="Set a master password" subtitle="It encrypts your saved connection passwords on this device. It's never stored.">
      <div className="space-y-3">
        <Field icon={Lock} value={pw} onChange={setPw} placeholder="Master password" autoFocus />
        {pw ? <StrengthBar score={strength.score} /> : null}
        <Field icon={Lock} value={confirm} onChange={setConfirm} placeholder="Confirm password" onEnter={create} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          {strength.checks.map((c) => (
            <span key={c.label} className={cn("flex items-center gap-1 text-[11.5px]", c.ok ? "text-primary" : "text-muted-foreground")}>
              <Check className={cn("h-3.5 w-3.5", c.ok ? "opacity-100" : "opacity-25")} /> {c.label}
            </span>
          ))}
        </div>
        {confirm && pw !== confirm ? <p className="text-[11.5px] text-destructive">Passwords don't match.</p> : null}
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <div className="pt-1">
          <PrimaryButton onClick={create} disabled={!canSubmit}>
            <ShieldCheck className="h-4 w-4" /> {busy ? "Creating…" : "Create master password"}
          </PrimaryButton>
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
      setBusy(false);
    }
  }

  if (mode === "recover") {
    return (
      <Shell icon={KeyRound} title="Reset with a recovery key" subtitle="Enter one of your 5 recovery keys and choose a new password.">
        <div className="space-y-3">
          <Field icon={KeyRound} value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autoFocus mono />
          <Field icon={Lock} value={newPw} onChange={setNewPw} placeholder="New master password" />
          {newPw ? <StrengthBar score={strength.score} /> : null}
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          <div className="pt-1">
            <PrimaryButton onClick={recover} disabled={!code.trim() || !strength.ok || busy}>
              <KeyRound className="h-4 w-4" /> {busy ? "Resetting…" : "Reset password & unlock"}
            </PrimaryButton>
          </div>
          <button onClick={() => { setMode("unlock"); setError(null); }} className="w-full pt-1 text-center text-[12px] text-muted-foreground hover:text-foreground">
            Back to unlock
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={Lock} title="Welcome back" subtitle="Enter your master password to unlock Exasol Studio.">
      <div className="space-y-3">
        <Field icon={Lock} value={pw} onChange={setPw} placeholder="Master password" autoFocus onEnter={unlock} />
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <div className="flex justify-center pt-1">
          <PrimaryButton onClick={unlock} disabled={!pw || busy} full={false}>
            <Lock className="h-4 w-4" /> {busy ? "Unlocking…" : "Unlock"}
          </PrimaryButton>
        </div>
        <button onClick={() => { setMode("recover"); setError(null); }} className="w-full pt-1 text-center text-[12px] text-muted-foreground hover:text-foreground">
          Forgot password? Use a recovery key
        </button>
      </div>
    </Shell>
  );
}
