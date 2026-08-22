import type { PriceRow } from "@/lib/api";
import { formatInr, snapshotLabel } from "@/lib/format";

export function PriceTicker({ prices }: { prices: PriceRow[] }) {
  const newest = prices[0]?.recordedAt ?? null;
  const label = snapshotLabel(newest);

  if (prices.length === 0) {
    return (
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
          <span className="text-sm text-muted-foreground">Waiting for the first scrape.</span>
        </div>
      </div>
    );
  }

  const strip = [...prices, ...prices];

  return (
    <div className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-hidden px-4 py-3 sm:px-6">
        <span className="shrink-0 border-r border-border pr-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="tape-track flex w-max gap-8">
            {strip.map((price, i) => {
              const delta =
                price.previousModalPrice == null
                  ? null
                  : price.modalPrice - price.previousModalPrice;
              return (
                <span key={`${price.id}-${i}`} className="flex shrink-0 items-baseline gap-2 whitespace-nowrap text-sm">
                  <span className="text-foreground">{price.commodity}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatInr(price.modalPrice)}
                  </span>
                  {delta != null && delta !== 0 && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        delta > 0 ? "text-healthy" : "text-failed"
                      }`}
                    >
                      {delta > 0 ? "+" : "−"}
                      {formatInr(Math.abs(delta))}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
