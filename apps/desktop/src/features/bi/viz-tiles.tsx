import type { ReactNode } from "react";

// Mini chart previews (Grafana-style tiles) — the visual vocabulary for every
// place a user picks a visualization. Art is theme-aware via var(--primary) /
// currentColor and drawn on a 48×28 viewBox.

export type VizTile = { key: string; hint: string; art: ReactNode };

export const VIZ_TILES: VizTile[] = [
  { key: "table", hint: "Raw rows and columns", art: (<g stroke="currentColor" opacity="0.5" strokeWidth="1"><rect x="8" y="5" width="32" height="16" rx="1.5" fill="none"/><line x1="8" y1="10" x2="40" y2="10"/><line x1="8" y1="15" x2="40" y2="15"/><line x1="21" y1="5" x2="21" y2="21"/><line x1="30" y1="5" x2="30" y2="21"/></g>) },
  { key: "bar", hint: "Compare categories", art: (<g><rect x="6" y="12" width="6" height="12" rx="1" fill="currentColor" opacity="0.45"/><rect x="15" y="6" width="6" height="18" rx="1" fill="var(--primary)"/><rect x="24" y="15" width="6" height="9" rx="1" fill="currentColor" opacity="0.45"/><rect x="33" y="9" width="6" height="15" rx="1" fill="currentColor" opacity="0.45"/></g>) },
  { key: "hbar", hint: "Compare many categories (horizontal)", art: (<g><rect x="8" y="5" width="26" height="4" rx="1" fill="var(--primary)"/><rect x="8" y="11" width="18" height="4" rx="1" fill="currentColor" opacity="0.45"/><rect x="8" y="17" width="30" height="4" rx="1" fill="currentColor" opacity="0.45"/></g>) },
  { key: "line", hint: "Trends over time", art: (<polyline points="5,20 15,12 24,15 33,7 43,10" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>) },
  { key: "area", hint: "Trend with magnitude", art: (<g><polygon points="5,22 15,12 24,16 33,7 43,11 43,24 5,24" fill="var(--primary)" opacity="0.25"/><polyline points="5,22 15,12 24,16 33,7 43,11" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" fill="none"/></g>) },
  { key: "pie", hint: "Proportions of a whole", art: (<g><circle cx="24" cy="13" r="9" fill="currentColor" opacity="0.35"/><path d="M24 13 L24 4 A9 9 0 0 1 32.5 16 Z" fill="var(--primary)"/></g>) },
  { key: "donut", hint: "Proportions, with a hole for a total", art: (<g><circle cx="24" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.35"/><path d="M24 4 A9 9 0 0 1 32.6 16" stroke="var(--primary)" strokeWidth="4" fill="none"/></g>) },
  { key: "scatter", hint: "Correlation between measures", art: (<g fill="currentColor" opacity="0.6"><circle cx="10" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="25" cy="16" r="2"/><circle cx="30" cy="8" r="2" fill="var(--primary)" opacity="1"/><circle cx="38" cy="11" r="2"/></g>) },
  { key: "heatmap", hint: "Density across two dimensions", art: (<g><rect x="9" y="5" width="7" height="7" fill="var(--primary)" opacity="0.9"/><rect x="17" y="5" width="7" height="7" fill="currentColor" opacity="0.25"/><rect x="25" y="5" width="7" height="7" fill="currentColor" opacity="0.5"/><rect x="33" y="5" width="7" height="7" fill="currentColor" opacity="0.2"/><rect x="9" y="13" width="7" height="7" fill="currentColor" opacity="0.35"/><rect x="17" y="13" width="7" height="7" fill="var(--primary)" opacity="0.6"/><rect x="25" y="13" width="7" height="7" fill="currentColor" opacity="0.2"/><rect x="33" y="13" width="7" height="7" fill="var(--primary)" opacity="0.4"/></g>) },
  { key: "funnel", hint: "Stage-by-stage drop-off", art: (<g fill="currentColor" opacity="0.5"><path d="M10 5 h28 l-5 5 h-18 Z" fill="var(--primary)" opacity="0.9"/><path d="M16 12 h16 l-4 5 h-8 Z"/><path d="M21 19 h6 l-1.5 4 h-3 Z"/></g>) },
  { key: "radar", hint: "Compare across several axes", art: (<g stroke="currentColor" opacity="0.4" fill="none"><polygon points="24,3 40,10 35,23 13,23 8,10"/><polygon points="24,8 34,12 31,20 17,20 14,12" stroke="var(--primary)" fill="var(--primary)" fillOpacity="0.2" opacity="1"/></g>) },
  { key: "radial", hint: "Progress rings per category", art: (<g fill="none" strokeLinecap="round"><path d="M24 22 A9 9 0 1 1 33 13" stroke="currentColor" opacity="0.3" strokeWidth="3"/><path d="M24 22 A9 9 0 1 1 30 5.5" stroke="var(--primary)" strokeWidth="3"/><path d="M24 18 A5 5 0 1 1 29 13" stroke="currentColor" opacity="0.45" strokeWidth="3"/></g>) },
  { key: "treemap", hint: "Composition of many parts", art: (<g><rect x="8" y="5" width="16" height="16" rx="1" fill="var(--primary)" opacity="0.75"/><rect x="26" y="5" width="14" height="9" rx="1" fill="currentColor" opacity="0.4"/><rect x="26" y="16" width="8" height="5" rx="1" fill="currentColor" opacity="0.3"/><rect x="36" y="16" width="4" height="5" rx="1" fill="currentColor" opacity="0.25"/></g>) },
  { key: "gauge", hint: "Progress toward a target", art: (<g fill="none"><path d="M10 21 A14 14 0 0 1 38 21" stroke="currentColor" opacity="0.3" strokeWidth="4"/><path d="M10 21 A14 14 0 0 1 27 8" stroke="var(--primary)" strokeWidth="4"/><circle cx="24" cy="21" r="2" fill="currentColor"/></g>) },
  { key: "kpi", hint: "One number that matters", art: (<g><text x="24" y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--primary)">42k</text><rect x="14" y="19" width="20" height="2" rx="1" fill="currentColor" opacity="0.35"/></g>) },
];

export { ECHARTS_KINDS, RECHARTS_KINDS } from "@/features/workbench/notebook-cell";

export function vizTile(key: string): VizTile | undefined {
  return VIZ_TILES.find((t) => t.key === key);
}
