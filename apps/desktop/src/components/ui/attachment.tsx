import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Attachment card primitives — one visual system for everything pinned to the
 * composer or a message: files, photos, oversized pastes, and `@` context.
 * Layout: [media] [title + meta] [actions].
 */

export function AttachmentGroup({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="attachment-group" className={cn("flex flex-wrap gap-1.5", className)} {...props} />;
}

export function Attachment({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment"
      className={cn(
        "group/attachment bg-muted/40 hover:bg-muted/70 relative flex items-center gap-2.5 rounded-lg border border-border/70 px-2 py-1.5 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function AttachmentMedia({
  variant = "icon",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: "icon" | "image" }) {
  return (
    <div
      data-slot="attachment-media"
      data-variant={variant}
      className={cn(
        "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
        variant === "image" && "overflow-hidden p-0 [&_img]:size-full [&_img]:object-cover",
        className,
      )}
      {...props}
    />
  );
}

export function AttachmentContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="attachment-content" className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function AttachmentTitle({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="attachment-title" className={cn("truncate text-[12px] font-medium text-foreground", className)} {...props} />;
}

export function AttachmentDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="attachment-description" className={cn("truncate text-[10.5px] text-muted-foreground", className)} {...props} />;
}

export function AttachmentActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="attachment-actions" className={cn("flex shrink-0 items-center gap-0.5", className)} {...props} />;
}

export function AttachmentAction({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="attachment-action"
      className={cn(
        "hover:bg-background/80 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}
