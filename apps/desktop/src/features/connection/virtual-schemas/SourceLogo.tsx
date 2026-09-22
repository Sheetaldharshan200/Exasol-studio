import { Database } from "lucide-react";
import { DbMark } from "@/components/brand/DbMarks";

/** A source's logo from the catalog's Simple Icons slug, or a plain database glyph. */
export function SourceLogo({ logo, className }: { logo?: string; className?: string }) {
  if (logo) return <DbMark name={logo} className={className} />;
  return <Database className={className} />;
}
