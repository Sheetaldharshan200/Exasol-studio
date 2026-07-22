import type { SVGProps } from "react";
import { ICONS, type IconName } from "@/components/ui/boxicons";
import { cn } from "@/lib/utils";

/**
 * The app's single icon component. Renders a Boxicons glyph from the central
 * registry (components/ui/boxicons.ts) in the current text color. Swapping the
 * whole app's icon set is a one-file change — edit the registry.
 *
 *   <Icon name="database" className="h-4 w-4" />
 */
export function Icon({
  name,
  className,
  ...props
}: { name: IconName } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg
      viewBox={def.vb}
      fill="currentColor"
      className={cn("h-4 w-4 shrink-0", className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: def.inner }}
      {...props}
    />
  );
}

export type { IconName };
