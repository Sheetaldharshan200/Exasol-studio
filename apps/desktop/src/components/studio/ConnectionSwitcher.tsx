/**
 * The toolbar connection switcher and the small labelled <Select> wrapper it
 * uses. Extracted from ExasolStudio.tsx.
 */
import { Database } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActiveConnection } from "@/state/useConnections";

export function Selector({
  icon,
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  icon?: React.ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select value={options.includes(value) ? value : undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-6 min-w-[120px] shrink-0 gap-1.5 text-xs" size="sm" aria-label={label}>
        {icon}
        <SelectValue placeholder={value} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{value}</div>
        ) : (
          options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

/** Toolbar switcher across all open connections (focus follows selection). */
export function ConnectionSwitcher({
  connections,
  activeProfileId,
  onFocus,
}: {
  connections: ActiveConnection[];
  activeProfileId: string | null;
  onFocus: (profileId: string) => void;
}) {
  return (
    <Select
      value={activeProfileId ?? undefined}
      onValueChange={onFocus}
      disabled={connections.length === 0}
    >
      <SelectTrigger className="h-6 min-w-[140px] shrink-0 gap-1.5 text-xs" size="sm" aria-label="Connection">
        <Database className="h-3.5 w-3.5 text-primary" />
        <SelectValue placeholder="not connected" />
      </SelectTrigger>
      <SelectContent>
        {connections.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">not connected</div>
        ) : (
          connections.map((c) => (
            <SelectItem key={c.profile.id} value={c.profile.id}>
              {c.profile.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
