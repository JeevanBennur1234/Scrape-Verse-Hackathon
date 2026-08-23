import { useMemo } from "react";
import type { PriceRow, Collector } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight, ShieldCheck, TrendingUp, DollarSign } from "lucide-react";

export function QuickInsights({ prices, collectors }: { prices: PriceRow[]; collectors: Collector[] }) {
  const insights = useMemo(() => {
    if (prices.length === 0) return null;

    const activeRows = prices.filter((p) => p.modalPrice > 0);
    if (activeRows.length === 0) return null;

    const highest = [...activeRows].sort((a, b) => b.modalPrice - a.modalPrice)[0];
    const lowest = [...activeRows].sort((a, b) => a.modalPrice - b.modalPrice)[0];

    const withMovers = activeRows
      .filter((p) => p.previousModalPrice !== null && p.previousModalPrice > 0)
      .map((p) => {
        const pct = ((p.modalPrice - (p.previousModalPrice as number)) / (p.previousModalPrice as number)) * 100;
        return { ...p, pct };
      });

    const topGainer = withMovers.length > 0 ? [...withMovers].sort((a, b) => b.pct - a.pct)[0] : null;
    const topLoser = withMovers.length > 0 ? [...withMovers].sort((a, b) => a.pct - b.pct)[0] : null;

    const activeCollectors = collectors.filter(c => c.id !== "c_msamb_pending" && c.id !== "PENDING");
    const totalCount = activeCollectors.length;
    const failedOrEscalatedCount = activeCollectors.filter((c) => c.status === "FAILED" || c.status === "ESCALATED" || c.status === "DEGRADED").length;
    
    let resilience = 100;
    if (totalCount > 0) {
      resilience = Math.round(((totalCount - failedOrEscalatedCount) / totalCount) * 100);
    }

    return {
      highest,
      lowest,
      topGainer: topGainer && topGainer.pct > 0 ? topGainer : null,
      topLoser: topLoser && topLoser.pct < 0 ? topLoser : null,
      resilience,
    };
  }, [prices, collectors]);

  const moverElement = useMemo(() => {
    if (!insights) return null;

    if (insights.topGainer) {
      return (
        <>
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-500">
            <ArrowUpRight className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Top Daily Gainer</p>
            <h3 className="font-serif text-base font-semibold truncate capitalize mt-0.5">
              {insights.topGainer.commodity}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Up <span className="text-emerald-500 font-mono font-bold">+{insights.topGainer.pct.toFixed(1)}%</span> today
            </p>
          </div>
        </>
      );
    }

    if (insights.topLoser) {
      return (
        <>
          <div className="rounded-lg bg-rose-500/10 p-2.5 text-rose-500">
            <ArrowDownRight className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Top Daily Loser</p>
            <h3 className="font-serif text-base font-semibold truncate capitalize mt-0.5">
              {insights.topLoser.commodity}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Down <span className="text-rose-500 font-mono font-bold">{insights.topLoser.pct.toFixed(1)}%</span> today
            </p>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">
          <TrendingUp className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono font-semibold">Mover Insights</p>
          <h3 className="font-serif text-sm font-semibold truncate mt-0.5 text-foreground">Stable Market</h3>
          <p className="text-xs text-muted-foreground mt-0.5">No price changes today</p>
        </div>
      </>
    );
  }, [insights]);

  if (!insights) {
    return null;
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full">
      {/* Highest Price */}
      <article className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] flex items-center gap-4">
        <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-500">
          <DollarSign className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Premium Market Spot</p>
          <h3 className="font-serif text-base font-semibold truncate capitalize mt-0.5">
            {insights.highest.commodity}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {insights.highest.market}: <span className="font-mono font-bold text-foreground">{formatInr(insights.highest.modalPrice)}</span>
          </p>
        </div>
      </article>

      {/* Lowest Price */}
      <article className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] flex items-center gap-4">
        <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-500">
          <TrendingUp className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Budget Spot</p>
          <h3 className="font-serif text-base font-semibold truncate capitalize mt-0.5">
            {insights.lowest.commodity}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {insights.lowest.market}: <span className="font-mono font-bold text-foreground">{formatInr(insights.lowest.modalPrice)}</span>
          </p>
        </div>
      </article>

      {/* Biggest Gainer/Loser */}
      <article className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] flex items-center gap-4">
        {moverElement}
      </article>

      {/* Resilience Rating */}
      <article className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)] flex items-center gap-4">
        <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-500">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Self-Healing Integrity</p>
          <h3 className="font-serif text-base font-semibold truncate mt-0.5">
            {insights.resilience}% Resilience
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {insights.resilience === 100 ? "All crawlers operational" : "Auto-healing active"}
          </p>
        </div>
      </article>
    </div>
  );
}
