import { BarChart3, Boxes, Cloud, Cpu, Database, FileCode2, Plug, Server, type LucideIcon } from "lucide-react";
import { McpMark } from "@/components/brand/McpMark";
import { ExasolMark } from "@/components/brand/ExasolMark";
import { cn } from "@/lib/utils";
import type { Kind, ResolvedCatalogItem } from "../catalog-data";

const KIND_ICON: Record<Kind, LucideIcon> = {
  database: Database,
  cli: Cpu,
  driver: Plug,
  server: Server,
  extension: Boxes,
  skills: FileCode2,
  cloud: Cloud,
  bi: BarChart3,
};

/**
 * The publisher tile every Docker Hub card leads with: a white square with
 * the mark inside — white in both themes on purpose, like a printed logo.
 * Official Exasol products carry the Exasol mark; MCP shows the MCP mark;
 * everything else its kind's glyph.
 */
export function HubLogo({ item, size = "md", className }: { item: Pick<ResolvedCatalogItem, "id" | "kind" | "labs">; size?: "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "h-16 w-16 rounded-xl" : "h-12 w-12 rounded-lg";
  const glyph = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  const Icon = KIND_ICON[item.kind];
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]", box, className)}>
      {item.id === "mcp-server" ? (
        <McpMark className={cn(glyph, "text-[#0b1730]")} />
      ) : item.id === "exasol-personal" || item.id === "exasol-cloud" || item.kind === "cloud" ? (
        <ExasolMark className={glyph} />
      ) : (
        <Icon className={cn(glyph, "text-[#0b1730]")} strokeWidth={1.75} />
      )}
    </span>
  );
}
