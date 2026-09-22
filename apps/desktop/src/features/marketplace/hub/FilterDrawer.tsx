import { BadgeCheck, Check } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SECTIONS, TRUST, type HubFilters, type SectionKey, type Trust } from "./filters";

/** Docker Hub's right-hand filter rail: trusted content, then categories. */
export function FilterDrawer({
  open,
  onOpenChange,
  filters,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: HubFilters;
  onChange: (next: HubFilters) => void;
}) {
  const toggleTrust = (t: Trust) => {
    const trust = new Set(filters.trust);
    if (trust.has(t)) trust.delete(t);
    else trust.add(t);
    onChange({ ...filters, trust });
  };
  const toggleSection = (s: SectionKey) => {
    const sections = new Set(filters.sections);
    if (sections.has(s)) sections.delete(s);
    else sections.add(s);
    onChange({ ...filters, sections });
  };
  const trustTone: Record<Trust, string> = { official: "text-info", labs: "text-syntax-function", installed: "text-primary" };
  const TrustGlyph = ({ t }: { t: Trust }) =>
    t === "official" ? (
      <BadgeCheck className="h-4 w-4" />
    ) : t === "labs" ? (
      <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-current">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </span>
    ) : (
      <Check className="h-4 w-4" />
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[320px] gap-0 overflow-y-auto p-0 sm:max-w-[320px]">
        <SheetTitle className="sr-only">Filters</SheetTitle>
        <div className="px-6 pt-8">
          <h3 className="text-[15px] font-semibold text-muted-foreground">Trusted content</h3>
          <ul className="mt-4 grid gap-1">
            {TRUST.map((t) => (
              <li key={t.key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-secondary/60">
                  <Checkbox checked={filters.trust.has(t.key)} onCheckedChange={() => toggleTrust(t.key)} className="h-5 w-5 rounded-[4px]" />
                  <span className={cn("flex items-center gap-2 text-[14px]", trustTone[t.key])}>
                    <TrustGlyph t={t.key} /> {t.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 pt-8 pb-8">
          <h3 className="text-[15px] font-semibold text-muted-foreground">Categories</h3>
          <ul className="mt-4 grid gap-1">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-secondary/60">
                  <Checkbox checked={filters.sections.has(s.key)} onCheckedChange={() => toggleSection(s.key)} className="h-5 w-5 rounded-[4px]" />
                  <span className="text-[14px] text-foreground">{s.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
