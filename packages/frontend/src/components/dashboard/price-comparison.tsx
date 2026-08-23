import { useState, useMemo } from "react";
import type { PriceRow } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function PriceComparison({ prices, loading }: { prices: PriceRow[]; loading: boolean }) {
  // Get unique commodity list
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

  // Fallback if selected is empty but list updated
  const activeCommodity = selected || commodities[0] || "";

  const matchingPrices = useMemo(() => {
    if (!activeCommodity) return [];
    return prices.filter((p) => p.commodity.toLowerCase() === activeCommodity);
  }, [prices, activeCommodity]);

  // Compute the market-wide average price for comparison
  const marketAverage = useMemo(() => {
    const activeRows = prices.filter((p) => p.modalPrice > 0);
    if (activeRows.length === 0) return 0;
    const sum = activeRows.reduce((acc, curr) => acc + curr.modalPrice, 0);
    return Math.round(sum / activeRows.length);
  }, [prices]);

  if (loading) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4 h-[350px] flex flex-col justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 mb-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-4 flex-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4 flex flex-col justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 mb-4">
        <div>
          <h2 className="font-serif text-xl font-medium">Market Price Compare</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Compare prices of the same crop across different mandis</p>
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

      {matchingPrices.length === 0 ? (
        <p className="text-center py-10 text-xs text-muted-foreground">Select a commodity to view comparisons.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {matchingPrices.map((p) => {
              const spread = p.maxPrice - p.minPrice;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-background/50 p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif text-sm font-semibold truncate">{p.market}</h3>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0 capitalize">
                        {p.collectorName.includes("Mumbai") ? "Maharashtra" : "Karnataka"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">Source: {p.collectorName}</p>
                  </div>
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Modal Price</span>
                      <span className="font-mono font-bold text-foreground">{formatInr(p.modalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Price Range</span>
                      <span className="font-mono text-muted-foreground">{formatInr(p.minPrice)} - {formatInr(p.maxPrice)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1 border-t border-border/30">
                      <span className="text-muted-foreground">Market Spread</span>
                      <span className="font-mono text-muted-foreground">{formatInr(spread)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Render a Market Benchmark Card side-by-side if there's only 1 market */}
            {matchingPrices.length === 1 && (
              <div className="rounded-lg border border-border/50 border-dashed bg-muted/10 p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif text-sm font-semibold text-muted-foreground truncate">Market Average (Benchmark)</h3>
                    <span className="text-[10px] bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                      All Crops
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Average rate across all listed commodities</p>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Average Price</span>
                    <span className="font-mono font-bold text-muted-foreground">{formatInr(marketAverage)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/40 italic mt-2">
                    Used as a benchmark reference.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Relative Modal Price Bar Comparison */}
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Relative Modal Price Bar Comparison</h4>
            <div className="space-y-3">
              {(() => {
                const itemsToCompare = [
                  ...matchingPrices.map((p) => ({
                    id: p.id,
                    label: `${p.market} (${p.commodity})`,
                    price: p.modalPrice,
                    isBenchmark: false,
                  })),
                  ...(matchingPrices.length === 1
                    ? [
                        {
                          id: "benchmark",
                          label: "Market Average (All Crops)",
                          price: marketAverage,
                          isBenchmark: true,
                        },
                      ]
                    : []),
                ];

                const maxPrice = Math.max(...itemsToCompare.map((item) => item.price), 1);

                return itemsToCompare.map((item) => {
                  const percent = (item.price / maxPrice) * 100;
                  return (
                    <div key={item.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className={`font-medium ${item.isBenchmark ? "text-muted-foreground italic font-normal" : "text-foreground"}`}>
                          {item.label}
                        </span>
                        <span className="font-mono font-bold text-foreground">{formatInr(item.price)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.isBenchmark ? "bg-[var(--color-healing)]" : "bg-[var(--color-healthy)]"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
