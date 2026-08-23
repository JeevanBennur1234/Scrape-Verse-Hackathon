import { useState, useMemo } from "react";
import type { PriceRow } from "@/lib/api";
import { formatInr } from "@/lib/format";

export function PriceComparison({ prices }: { prices: PriceRow[] }) {
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

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4">
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {matchingPrices.map((p) => {
              const spread = p.maxPrice - p.minPrice;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-background/50 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between">
                      <h3 className="font-serif text-sm font-semibold">{p.market}</h3>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground capitalize">
                        {p.collectorName.includes("Mumbai") ? "Maharashtra" : "Karnataka"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Source: {p.collectorName}</p>
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
          </div>

          {/* Simple visual bar chart using tailwind */}
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Relative Modal Price Bar Comparison</h4>
            <div className="space-y-2">
              {(() => {
                const maxModal = Math.max(...matchingPrices.map((p) => p.modalPrice), 1);
                return matchingPrices.map((p) => {
                  const percent = (p.modalPrice / maxModal) * 100;
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{p.market}</span>
                        <span className="font-mono font-bold">{formatInr(p.modalPrice)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all duration-500"
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
