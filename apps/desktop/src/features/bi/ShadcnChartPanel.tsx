import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StatementResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui charts (Recharts) for the common dashboard chart types — the
 * ui.shadcn.com/charts look: dashed grid without vertical lines, unboxed axes,
 * rounded bars, natural curves, gradient areas, animated draw-in, and the
 * shadcn tooltip/legend. Exotic types (heatmap, treemap, gauge…) stay ECharts.
 */
const ROW_CAP = 1000;

const isNum = (v: unknown) => typeof v === "number" || (v !== null && v !== "" && !Number.isNaN(Number(v)));
const toNum = (v: unknown) => (typeof v === "number" ? v : Number(v));

export function ShadcnChartPanel({
  chart,
  result,
}: {
  chart: "bar" | "hbar" | "line" | "area" | "pie" | "donut" | "radar" | "radial";
  result: StatementResult;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { data, catKey, series, config } = useMemo(() => {
    const cols = result.columns.map((c) => c.name);
    const sample = result.rows[0] ?? [];
    // First non-numeric column = category axis; numeric columns = series.
    let catIdx = cols.findIndex((_, i) => !isNum(sample[i]));
    if (catIdx < 0) catIdx = 0;
    const numIdx = cols.map((_, i) => i).filter((i) => i !== catIdx && isNum(sample[i])).slice(0, 5);
    const keys = numIdx.map((i) => `s${i}`);
    const config: ChartConfig = {};
    numIdx.forEach((i, k) => {
      config[keys[k]] = { label: cols[i], color: `var(--chart-${(k % 5) + 1})` };
    });
    const data = result.rows.slice(0, ROW_CAP).map((row) => {
      const o: Record<string, unknown> = { __cat: String(row[catIdx] ?? "") };
      numIdx.forEach((i, k) => (o[keys[k]] = toNum(row[i])));
      return o;
    });
    return { data, catKey: "__cat", series: keys, config };
  }, [result]);

  // Click-to-isolate: clicking a series in the legend highlights just that one
  // and dims the rest; click it again (or the active one) to show all.
  const [active, setActive] = useState<string | null>(null);
  const activeIfPresent = active && series.includes(active) ? active : null;
  const dimmed = (k: string) => activeIfPresent !== null && activeIfPresent !== k;
  const lineOpacity = (k: string) => (dimmed(k) ? 0.12 : 1);
  const fillOpacity = (k: string) => (dimmed(k) ? 0.05 : undefined);
  // Clicking a series (the actual line/bar/area, or its legend chip) spotlights
  // it; clicking the same one again restores all.
  const toggle = (k: string) => setActive((cur) => (cur === k ? null : k));
  const clickCursor = { cursor: "pointer" as const };

  // Animation policy: draw in on first render, when the chart type changes, and
  // on hover — but NOT on every data refresh (that caused the endless looping).
  // `animKey` remounts the chart so the entrance replays; `animate` is only true
  // during that brief window, so a background refresh just merges data silently.
  const [hoverNonce, setHoverNonce] = useState(0);
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    setAnimate(true);
    const id = setTimeout(() => setAnimate(false), 900);
    return () => clearTimeout(id);
  }, [chart, hoverNonce]);
  const animKey = `${chart}-${hoverNonce}`;
  const bump = () => setHoverNonce((n) => n + 1);
  const anim = { isAnimationActive: animate, animationDuration: 700 as const };

  if (!data.length || !series.length) {
    return <p className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No numeric columns to chart.</p>;
  }

  const axis = { tickLine: false as const, axisLine: false as const, tickMargin: 8, fontSize: 10 };

  /** Interactive legend — click a series to isolate it. Only shown for
   *  multi-series charts, where "highlight one, dim the others" is meaningful. */
  const InteractiveLegend =
    series.length > 1 ? (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 pt-1">
        {series.map((k) => {
          const isActive = activeIfPresent === k;
          const isDim = dimmed(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setActive((cur) => (cur === k ? null : k))}
              title={isActive ? "Show all series" : `Highlight ${String(config[k]?.label ?? k)}`}
              className={cn(
                "flex items-center gap-1.5 rounded px-1 text-[10.5px] transition-opacity",
                isDim ? "opacity-40 hover:opacity-70" : "opacity-100",
                isActive && "font-medium",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: `var(--color-${k})` }} />
              <span className="text-foreground">{String(config[k]?.label ?? k)}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  // Wraps a chart with the interactive legend on top, filling the panel, and
  // catches hover to replay the draw-in animation.
  const Wrap = ({ children }: { children: ReactNode }) => (
    <div className="flex h-full w-full flex-col" onMouseEnter={bump}>
      {InteractiveLegend}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );

  if (chart === "pie" || chart === "donut") {
    const key = series[0];
    const pieData: Record<string, unknown>[] = data.slice(0, 12).map((d, i) => ({ ...d, fill: `var(--chart-${(i % 5) + 1})` }));
    const pieConfig: ChartConfig = Object.fromEntries(pieData.map((d) => [String(d[catKey]), { label: String(d[catKey]) }]));
    return (
      <Wrap>
        <ChartContainer key={animKey} config={{ ...config, ...pieConfig }} className="h-full w-full p-2">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie data={pieData} dataKey={key} nameKey={catKey} innerRadius={chart === "donut" ? "55%" : 0} strokeWidth={2} {...anim} />
            <ChartLegend content={<ChartLegendContent nameKey={catKey} />} className="flex-wrap" />
          </PieChart>
        </ChartContainer>
      </Wrap>
    );
  }

  if (chart === "radar") {
    // Compare series across category axes (shadcn radar recipe).
    const radarData = data.slice(0, 12);
    return (
      <Wrap>
        <ChartContainer key={animKey} config={config} className="h-full w-full p-2">
          <RadarChart data={radarData}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarGrid />
            <PolarAngleAxis dataKey={catKey} fontSize={10} />
            {series.map((k) => (
              <Radar key={k} dataKey={k} stroke={`var(--color-${k})`} fill={`var(--color-${k})`} fillOpacity={dimmed(k) ? 0.04 : 0.35} strokeOpacity={lineOpacity(k)} dot={{ r: 3, fillOpacity: dimmed(k) ? 0.1 : 1 }} style={clickCursor} onClick={() => toggle(k)} {...anim} />
            ))}
          </RadarChart>
        </ChartContainer>
      </Wrap>
    );
  }

  if (chart === "radial") {
    // Progress rings per category (shadcn radial-bar recipe).
    const key = series[0];
    const radialData: Record<string, unknown>[] = data.slice(0, 8).map((d, i) => ({ ...d, fill: `var(--chart-${(i % 5) + 1})` }));
    const radialConfig: ChartConfig = Object.fromEntries(radialData.map((d) => [String(d[catKey]), { label: String(d[catKey]) }]));
    return (
      <Wrap>
        <ChartContainer key={animKey} config={{ ...config, ...radialConfig }} className="h-full w-full p-2">
          <RadialBarChart data={radialData} innerRadius="25%" outerRadius="100%">
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey={catKey} />} />
            <RadialBar dataKey={key} background cornerRadius={6} {...anim} />
            <ChartLegend content={<ChartLegendContent nameKey={catKey} />} className="flex-wrap" />
          </RadialBarChart>
        </ChartContainer>
      </Wrap>
    );
  }

  if (chart === "line") {
    return (
      <Wrap>
        <ChartContainer key={animKey} config={config} className="h-full w-full p-2">
          <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={catKey} {...axis} />
            <YAxis {...axis} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {series.map((k) => (
              <Line key={k} dataKey={k} type="natural" stroke={`var(--color-${k})`} strokeOpacity={lineOpacity(k)} strokeWidth={activeIfPresent === k ? 3 : 2} dot={false} activeDot={{ r: 4, style: clickCursor, onClick: () => toggle(k) }} style={clickCursor} onClick={() => toggle(k)} {...anim} />
            ))}
          </LineChart>
        </ChartContainer>
      </Wrap>
    );
  }

  if (chart === "area") {
    return (
      <Wrap>
        <ChartContainer key={animKey} config={config} className="h-full w-full p-2">
          <AreaChart accessibilityLayer data={data} margin={{ left: 8, right: 12, top: 8 }}>
            <defs>
              {series.map((k) => (
                <linearGradient key={k} id={`fill-${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey={catKey} {...axis} />
            <YAxis {...axis} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {series.map((k) => (
              <Area key={k} dataKey={k} type="natural" fill={`url(#fill-${uid}-${k})`} fillOpacity={fillOpacity(k)} stroke={`var(--color-${k})`} strokeOpacity={lineOpacity(k)} strokeWidth={2} stackId={undefined} style={clickCursor} onClick={() => toggle(k)} {...anim} />
            ))}
          </AreaChart>
        </ChartContainer>
      </Wrap>
    );
  }

  // bar / hbar — the signature rounded shadcn bars.
  const vertical = chart === "hbar";
  return (
    <Wrap>
      <ChartContainer key={animKey} config={config} className="h-full w-full p-2">
        <BarChart accessibilityLayer data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ left: 8, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          {vertical ? (
            <>
              <XAxis type="number" {...axis} />
              <YAxis dataKey={catKey} type="category" {...axis} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={catKey} {...axis} />
              <YAxis {...axis} width={40} />
            </>
          )}
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {series.map((k) => (
            <Bar key={k} dataKey={k} fill={`var(--color-${k})`} fillOpacity={dimmed(k) ? 0.18 : 1} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} style={clickCursor} onClick={() => toggle(k)} {...anim} />
          ))}
        </BarChart>
      </ChartContainer>
    </Wrap>
  );
}
