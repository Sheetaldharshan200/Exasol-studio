import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AppSelectGroup = { label: string; options: { value: string; label: string }[] };

/**
 * The app's ONE dropdown for plain value selection — a thin wrapper over the
 * themed Radix select so no surface ever reaches for a native <select>.
 * An empty-string value renders the placeholder (Radix items can't be "").
 */
export function AppSelect({
  value,
  onChange,
  options,
  groups,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  groups?: AppSelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className={cn("h-7 text-[12px]", className)}>
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {(options ?? []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {(groups ?? []).map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
