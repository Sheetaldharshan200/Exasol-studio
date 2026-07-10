import * as React from "react";
import {
  Group as ResizablePrimitiveGroup,
  Panel as ResizablePrimitivePanel,
  Separator as ResizablePrimitiveSeparator,
  type PanelImperativeHandle
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  direction,
  ...props
}: Omit<React.ComponentProps<typeof ResizablePrimitiveGroup>, "orientation"> & {
  direction: "horizontal" | "vertical";
}) {
  return (
    <ResizablePrimitiveGroup
      className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
      orientation={direction}
      {...props}
    />
  );
}

const ResizablePanel = ResizablePrimitivePanel;

function ResizableHandle({
  className,
  groupDirection = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitiveSeparator> & {
  groupDirection?: "horizontal" | "vertical";
}) {
  return (
    <ResizablePrimitiveSeparator
      className={cn(
        "group relative flex shrink-0 items-center justify-center bg-background/95 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 hover:bg-primary/12",
        groupDirection === "horizontal"
          ? "w-1.5 cursor-col-resize"
          : "h-1.5 cursor-row-resize",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "rounded-full bg-border transition-colors group-hover:bg-primary/70",
          groupDirection === "horizontal" ? "h-12 w-px" : "h-px w-12"
        )}
      />
    </ResizablePrimitiveSeparator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
export type { PanelImperativeHandle };
