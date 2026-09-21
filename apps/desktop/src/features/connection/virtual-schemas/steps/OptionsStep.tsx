import { Input } from "@/components/ui/input";
import type { PlanNames } from "../plan.ts";

/** Step 3: what to call things in Exasol. Sensible defaults, all editable. */
export function OptionsStep({ names, onChange }: { names: PlanNames; onChange: (next: PlanNames) => void }) {
  const field = (label: string, key: keyof PlanNames, help: string) => (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <Input
        value={names[key] ?? ""}
        onChange={(e) => onChange({ ...names, [key]: e.target.value })}
        spellCheck={false}
        className="h-8 bg-editor font-mono text-[13px] text-foreground"
      />
      <span className="text-[10.5px] text-muted-foreground/80">{help}</span>
    </label>
  );
  return (
    <div className="grid gap-3">
      {field("Virtual schema name", "virtualSchema", "How the source appears here — you will write SELECT … FROM <this>.<table>.")}
      {field("Connection name", "connection", "The CONNECTION object that holds the credentials; the schema references it by name.")}
      {field("Adapter schema", "adapterSchema", "Where the adapter script lives. Shared by every source using the same adapter.")}
    </div>
  );
}

export function namesComplete(names: PlanNames): boolean {
  return names.virtualSchema.trim() !== "" && names.connection.trim() !== "" && (names.adapterSchema ?? "").trim() !== "";
}
