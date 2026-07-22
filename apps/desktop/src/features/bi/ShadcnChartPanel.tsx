import { useId, useMemo } from "react";
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

  if (!data.length || !series.length) {
    return <p className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No numeric columns to chart.</p>;
  }

  const axis = { tickLine: false as const, axisLine: false as const, tickMargin: 8, fontSize: 10 };
  const legend = series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null;

  if (chart === "pie" || chart === "donut") {
    const key = series[0];
    const pieData: Record<string, unknown>[] = data.slice(0, 12).map((d, i) => ({ ...d, fill: `var(--chart-${(i % 5) + 1})` }));
    const pieConfig: ChartConfig = Object.fromEntries(pieData.map((d) => [String(d[catKey]), { label: String(d[catKey]) }]));
    return (
      <ChartContainer config={{ ...config, ...pieConfig }} className="h-full w-full p-2">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie data={pieData} dataKey={key} nameKey={catKey} innerRadius={chart === "donut" ? "55%" : 0} strokeWidth={2} />
          <ChartLegend content={<ChartLegendContent nameKey={catKey} />} className="flex-wrap" />
        </PieChart>
      </ChartContainer>
    );
  }

  if (chart === "radar") {
    // Compare series across category axes (shadcn radar recipe).
    const radarData = data.slice(0, 12);
    return (
      <ChartContainer config={config} className="h-full w-full p-2">
        <RadarChart data={radarData}>
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <PolarGrid />
          <PolarAngleAxis dataKey={catKey} fontSize={10} />
          {legend}
          {series.map((k) => (
            <Radar key={k} dataKey={k} stroke={`var(--color-${k})`} fill={`var(--color-${k})`} fillOpacity={0.35} dot={{ r: 3, fillOpacity: 1 }} />
          ))}
        </RadarChart>
      </ChartContainer>
    );
  }

  if (chart === "radial") {
    // Progress rings per category (shadcn radial-bar recipe).
    const key = series[0];
    const radialData: Record<string, unknown>[] = data.slice(0, 8).map((d, i) => ({ ...d, fill: `var(--chart-${(i % 5) + 1})` }));
    const radialConfig: ChartConfig = Object.fromEntries(radialData.map((d) => [String(d[catKey]), { label: String(d[catKey]) }]));
    return (
      <ChartContainer config={{ ...config, ...radialConfig }} className="h-full w-full p-2">
        <RadialBarChart data={radialData} innerRadius="25%" outerRadius="100%">
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey={catKey} />} />
          <RadialBar dataKey={key} background cornerRadius={6} />
          <ChartLegend content={<ChartLegendContent nameKey={catKey} />} className="flex-wrap" />
        </RadialBarChart>
      </ChartContainer>
    );
  }

  if (chart === "line") {
    return (
      <ChartContainer config={config} className="h-full w-full p-2">
        <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={catKey} {...axis} />
          <YAxis {...axis} width={40} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {legend}
          {series.map((k) => (
            <Line key={k} dataKey={k} type="natural" stroke={`var(--color-${k})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ChartContainer>
    );
  }

  if (chart === "area") {
    return (
      <ChartContainer config={config} className="h-full w-full p-2">
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
          {legend}
          {series.map((k) => (
            <Area key={k} dataKey={k} type="natural" fill={`url(#fill-${uid}-${k})`} stroke={`var(--color-${k})`} strokeWidth={2} stackId={undefined} />
          ))}
        </AreaChart>
      </ChartContainer>
    );
  }

  // bar / hbar — the signature rounded shadcn bars.
  const vertical = chart === "hbar";
  return (
    <ChartContainer config={config} className="h-full w-full p-2">
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
        {legend}
        {series.map((k) => (
          <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
