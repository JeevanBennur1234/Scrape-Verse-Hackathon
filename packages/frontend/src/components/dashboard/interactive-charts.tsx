import { useState, useMemo, useRef } from "react";
import type { PriceRow } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

// Monotone-like bezier curve path generator for line smoothness
function getBezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    // Smooth control points
    const cp1x = p0.x + (p1.x - p0.x) / 3;
    const cp1y = p0.y;
    const cp2x = p0.x + 2 * (p1.x - p0.x) / 3;
    const cp2y = p1.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function InteractiveCharts({ prices, loading }: { prices: PriceRow[]; loading: boolean }) {
  // 1. Get unique commodity list
  const commodities = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) {
      if (p.commodity) {
        set.add(p.commodity.toLowerCase());
      }
    }
    return [...set].sort();
  }, [prices]);

  const [selected, setSelected] = useState<string>(commodities[0] || "");
  const activeCommodity = selected || commodities[0] || "";

  // 2. Filter and group ticks for the active commodity by date
  const chartData = useMemo(() => {
    if (!activeCommodity) return [];
    
    const matching = prices.filter((p) => p.commodity.toLowerCase() === activeCommodity);
    
    // Group by date YYYY-MM-DD
    const groups = new Map<string, { sum: number; count: number; rawDate: string }>();
    for (const p of matching) {
      const dateStr = new Date(p.recordedAt).toISOString().slice(0, 10);
      const group = groups.get(dateStr) ?? { sum: 0, count: 0, rawDate: p.recordedAt };
      group.sum += p.modalPrice;
      group.count += 1;
      groups.set(dateStr, group);
    }

    // Map to array and sort chronologically
    return [...groups.entries()]
      .map(([date, data]) => ({
        date,
        avgPrice: Math.round(data.sum / data.count),
        displayDate: new Date(data.rawDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [prices, activeCommodity]);

  // SVG dimensions
  const width = 500;
  const height = 220;
  const paddingLeft = 55; // Expanded to fit currency symbols
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // 3. Compute scale ranges
  const scales = useMemo(() => {
    if (chartData.length === 0) return null;
    const prices = chartData.map((d) => d.avgPrice);
    let minVal = Math.min(...prices);
    let maxVal = Math.max(...prices);
    
    // Cushion logic to prevent flattening at boundaries
    if (minVal === maxVal) {
      minVal = Math.max(0, minVal - 500);
      maxVal = maxVal + 500;
    } else {
      const diff = maxVal - minVal;
      minVal = Math.max(0, minVal - diff * 0.1);
      maxVal = maxVal + diff * 0.1;
    }
    const valueRange = maxVal - minVal || 1;

    return {
      minVal,
      maxVal,
      valueRange,
    };
  }, [chartData]);

  // Coordinate mapper helpers
  const getX = (index: number) => {
    if (chartData.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (chartData.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    if (!scales) return paddingTop + chartHeight / 2;
    const ratio = (val - scales.minVal) / scales.valueRange;
    return paddingTop + chartHeight - ratio * chartHeight;
  };

  // Convert chartData to points array
  const points = useMemo(() => {
    return chartData.map((d, i) => ({ x: getX(i), y: getY(d.avgPrice) }));
  }, [chartData, scales]);

  // Smooth Bezier line path
  const linePath = useMemo(() => {
    return getBezierPath(points);
  }, [points]);

  // Area path builder for gradients
  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const bottomY = height - paddingBottom;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, linePath]);

  // Interactive Hover state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (chartData.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgMouseX = (mouseX / rect.width) * width; // scale to viewbox coords

    // Find nearest data point index
    let bestIndex = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < chartData.length; i++) {
      const diff = Math.abs(getX(i) - svgMouseX);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }

    setHoverIndex(bestIndex);
    setTooltipPos({
      x: getX(bestIndex),
      y: getY(chartData[bestIndex].avgPrice),
    });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Y-axis gridlines count (e.g. 4 partitions)
  const gridlines = useMemo(() => {
    if (!scales) return [];
    const arr = [];
    const divisions = 3;
    for (let i = 0; i <= divisions; i++) {
      const val = scales.minVal + (i / divisions) * scales.valueRange;
      arr.push(val);
    }
    return arr;
  }, [scales]);

  if (loading) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4 flex flex-col justify-between h-[340px]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 mb-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex-1 flex items-end gap-2 px-6 pb-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4 flex flex-col justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 mb-4">
        <div>
          <h2 className="font-serif text-xl font-medium">Price Spot Trends</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Average daily wholesale rates historical flow</p>
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Average Price (₹/Quintal)</span>
          </div>
        </div>
        <select
          value={activeCommodity}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {commodities.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {chartData.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-muted-foreground">
          <p className="text-xs">No historical trend data points available.</p>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            className="w-full h-auto max-h-[220px]"
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Gridlines & Y-Axis Labels */}
            {gridlines.map((val, i) => {
              const y = getY(val);
              return (
                <g key={i} className="stroke-border/30">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    className="fill-muted-foreground font-mono text-[9px] text-right"
                    textAnchor="end"
                    stroke="none"
                  >
                    ₹{Math.round(val).toLocaleString("en-IN")}
                  </text>
                </g>
              );
            })}

            {/* X Axis Labels with boundary protection */}
            {chartData.map((d, i) => {
              const isLabelVisible =
                chartData.length < 8 ||
                i === 0 ||
                i === chartData.length - 1 ||
                i === Math.floor(chartData.length / 2);

              if (!isLabelVisible) return null;

              const labelAnchor =
                i === 0
                  ? "start"
                  : i === chartData.length - 1
                  ? "end"
                  : "middle";

              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={height - 10}
                  className="fill-muted-foreground font-mono text-[9px]"
                  textAnchor={labelAnchor}
                >
                  {d.displayDate}
                </text>
              );
            })}

            {/* Gradient Area under line */}
            <path d={areaPath} fill="url(#chartGradient)" />

            {/* Trend line (Smooth curve) */}
            <path
              d={linePath}
              className="stroke-emerald-500"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Data point dots */}
            {chartData.map((d, i) => (
              <circle
                key={i}
                cx={getX(i)}
                cy={getY(d.avgPrice)}
                r="3.5"
                className="fill-background stroke-emerald-500 stroke-[2px] transition-all cursor-pointer"
              />
            ))}

            {/* Hover tooltip guide line */}
            {hoverIndex !== null && (
              <line
                x1={tooltipPos.x}
                y1={paddingTop}
                x2={tooltipPos.x}
                y2={height - paddingBottom}
                className="stroke-emerald-400/40"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
            )}

            {/* Hover tooltip circle */}
            {hoverIndex !== null && (
              <circle
                cx={tooltipPos.x}
                cy={tooltipPos.y}
                r="5.5"
                className="fill-emerald-500 stroke-background stroke-[2px]"
              />
            )}
          </svg>

          {/* Interactive Tooltip Card overlay (HTML overlay) */}
          {hoverIndex !== null && chartData[hoverIndex] && (
            <div
              className="absolute bg-card/90 backdrop-blur-sm border border-border px-3 py-2 rounded-lg shadow-xl pointer-events-none text-xs font-mono z-20 transition-all duration-150"
              style={{
                left: `${(tooltipPos.x / width) * 100}%`,
                top: `${(tooltipPos.y / height) * 100}%`,
                transform: "translate(-50%, -115%)",
              }}
            >
              <div className="text-[10px] text-muted-foreground mb-0.5">{chartData[hoverIndex].date}</div>
              <div className="font-bold text-[var(--color-healthy)]">
                Avg: {formatInr(chartData[hoverIndex].avgPrice)}/Q
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
