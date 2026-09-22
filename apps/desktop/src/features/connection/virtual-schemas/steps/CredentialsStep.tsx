import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FieldValues, VsAdapter } from "../types.ts";
import { pointsAtLocalhost } from "../plan.ts";

/**
 * Step 2: exactly the fields this adapter declares — nothing about JDBC URLs
 * or driver classes; those come from the catalog.
 */
export function CredentialsStep({
  adapter,
  values,
  onChange,
  managedLocal,
}: {
  adapter: VsAdapter;
  values: FieldValues;
  onChange: (next: FieldValues) => void;
  /** The target is Studio's own local Exasol, which runs inside the launcher's runtime. */
  managedLocal: boolean;
}) {
  const localhostWarning = managedLocal && pointsAtLocalhost(values);
  return (
    <div className="grid gap-3">
      {adapter.note ? <p className="rounded-md border border-border bg-panel/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">{adapter.note}</p> : null}
      {adapter.fields.map((f) => (
        <label key={f.key} className="grid gap-1 text-[11px] text-muted-foreground">
          <span>
            {f.label}
            {f.required ? <span className="text-destructive"> *</span> : null}
          </span>
          {f.key === "mapping" || f.key === "keyJson" ? (
            <textarea
              value={values[f.key] ?? ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              rows={5}
              spellCheck={false}
              className="min-h-[96px] rounded-md border border-border bg-editor px-2 py-1.5 font-mono text-[12px] text-foreground"
            />
          ) : (
            <Input
              type={f.kind === "password" ? "password" : f.kind === "number" ? "number" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              autoComplete={f.kind === "password" ? "new-password" : "off"}
              className="h-8 bg-editor text-[13px] text-foreground"
            />
          )}
          {f.help ? <span className="text-[10.5px] text-muted-foreground/80">{f.help}</span> : null}
        </label>
      ))}
      {localhostWarning ? (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            The database connects to this source, not your laptop — and the local Exasol runs inside its own runtime, where{" "}
            <span className="font-mono">localhost</span> means that runtime. Use this computer’s network address (or the
            container hostname the runtime can reach) instead.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Every required field has a value. */
export function credentialsComplete(adapter: VsAdapter, values: FieldValues): boolean {
  return adapter.fields.every((f) => !f.required || (values[f.key] ?? "").trim() !== "");
}
