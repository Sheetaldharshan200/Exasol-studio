import { Icon } from "@/components/ui/icon";

/**
 * Official MCP mark. A thin wrapper over the central Boxicons registry entry
 * ("mcp") so every MCP surface — activity rail, tab strip, marketplace cards,
 * assistant panel — renders the exact same glyph from ONE svg source.
 */
export function McpMark({ className }: { className?: string }) {
  return <Icon name="mcp" className={className} />;
}
