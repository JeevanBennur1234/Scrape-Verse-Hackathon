import type { Collector, PriceRow } from "@/lib/api";
import { Badge, statusTone } from "@/components/ui/badge";
import { relativeTime, formatInr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function StatusCards({
  collectors,
  prices,
  loading,
}: {
  collectors: Collector[];
  prices: PriceRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  }

  // Calculate stats
  const modalPrices = prices.map((p) => p.modalPrice).filter((p) => p > 0);
  const minVal = modalPrices.length > 0 ? Math.min(...modalPrices) : 0;
  const maxVal = modalPrices.length > 0 ? Math.max(...modalPrices) : 0;
  const avgVal =
    modalPrices.length > 0 ? modalPrices.reduce((sum, p) => sum + p, 0) / modalPrices.length : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <article className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono">Min Price</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{minVal ? formatInr(minVal) : "₹0"}</p>
        </article>
        <article className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono">Max Price</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{maxVal ? formatInr(maxVal) : "₹0"}</p>
        </article>
        <article className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono">Avg Price</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{avgVal ? formatInr(Math.round(avgVal)) : "₹0"}</p>
        </article>
        <article className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono">Commodities</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{prices.length}</p>
        </article>
      </div>

      {/* Collector Status Cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(() => {
          const activeCollectors = collectors.filter(
            (c) => c.id !== "c_msamb_pending" && c.status !== "PENDING_SETUP"
          );
          if (activeCollectors.length === 0) {
            return (
              <p className="col-span-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground text-center">
                No active collectors.
              </p>
            );
          }
          return activeCollectors.map((collector) => {
            const ticks = prices.filter((p) => p.collectorId === collector.id);
            const newest = ticks[0];
            const pending = collector.status === "PENDING_SETUP";
            return (
              <article
                key={collector.id}
                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-serif text-lg font-medium leading-snug">{collector.name}</h2>
                    <Badge tone={statusTone(collector.status)}>{collector.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-muted-foreground break-all select-all">
                    ID: <span className="text-foreground">{collector.id}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">
                    Source: <a href={collector.portalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{collector.portalUrl}</a>
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-border/50">
                  {pending ? (
                    <p className="text-xs text-muted-foreground">Awaiting collector creation via Bright Data API.</p>
                  ) : newest ? (
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span><strong className="text-foreground font-mono font-semibold">{ticks.length}</strong> items tracked</span>
                        <span>freshness: <strong className="text-foreground font-semibold">{relativeTime(newest.recordedAt)}</strong></span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 text-right select-all">
                        Last Success: {new Date(newest.recordedAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Awaiting first successful scrape execution.</p>
                  )}
                </div>
              </article>
            );
          })
        })()}
      </div>
    </div>
  );
}
