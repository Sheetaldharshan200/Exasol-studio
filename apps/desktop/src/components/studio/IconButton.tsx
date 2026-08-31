import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A 28px square icon button with a tooltip — the studio's standard toolbar
 * control. Extracted from ExasolStudio.tsx so the title bar, sidebar, and
 * history dock can share one definition.
 */
export function IconButton({
  label,
  onClick,
  onMouseDown,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  /** e.g. preventDefault to keep the editor's focus/selection on click. */
  onMouseDown?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          onMouseDown={onMouseDown}
          disabled={disabled}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            active && "text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
