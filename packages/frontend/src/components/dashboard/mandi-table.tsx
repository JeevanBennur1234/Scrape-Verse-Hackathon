import { useMemo, useState } from "react";
import type { PriceRow } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatInr, formatQty } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "commodity" | "modalPrice" | "arrivalQty" | "recordedAt";

function Sparkline({ current, previous }: { current: number; previous: number | null }) {
  if (!previous) {
    return (
      <svg className="w-16 h-6 stroke-muted-foreground/30 fill-none" viewBox="0 0 60 20">
        <path d="M 0 10 L 60 10" strokeWidth="1.5" />
      </svg>
    );
  }
  
  const diff = current - previous;
  const isUp = diff >= 0;
  const color = isUp ? "stroke-emerald-500" : "stroke-rose-500";
  
  const y1 = isUp ? 15 : 5;
  const y2 = isUp ? 11 : 9;
  const y3 = isUp ? 8 : 12;
  const y4 = isUp ? 5 : 15;
  
  return (
    <svg className={`w-16 h-6 fill-none ${color}`} viewBox="0 0 60 20">
      <path d={`M 0 ${y1} Q 20 ${y2}, 40 ${y3} T 60 ${y4}`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MandiTable({ prices, loading }: { prices: PriceRow[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("commodity");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Inferred helper
  const getState = (collectorName: string) => {
    const name = collectorName.toLowerCase();
    if (name.includes("mumbai") || name.includes("maharashtra")) return "Maharashtra";
    if (name.includes("bangalore") || name.includes("karnataka") || name.includes("bengaluru")) return "Karnataka";
    if (name.includes("punjab")) return "Punjab";
    return "Other";
  };

  // Get unique filter values
  const uniqueMarkets = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) {
      if (p.market) set.add(p.market);
    }
    return [...set].sort();
  }, [prices]);

  const uniqueStates = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) {
      set.add(getState(p.collectorName));
    }
    return [...set].sort();
  }, [prices]);

  // Filter & Sort Logic
  const filtered = useMemo(() => {
    let rows = prices;

    // Search query filter
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((p) =>
        `${p.commodity} ${p.market} ${p.collectorName}`.toLowerCase().includes(needle)
      );
    }

    // Market filter
    if (marketFilter) {
      rows = rows.filter((p) => p.market === marketFilter);
    }

    // State filter
    if (stateFilter) {
      rows = rows.filter((p) => getState(p.collectorName) === stateFilter);
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate).getTime();
      rows = rows.filter((p) => new Date(p.recordedAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime() + 86400000; // end of day
      rows = rows.filter((p) => new Date(p.recordedAt).getTime() <= end);
    }

    // Sort
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "en");
      }
      return dir === "asc" ? cmp : -cmp;
    });

    return copy;
  }, [prices, q, marketFilter, stateFilter, startDate, endDate, sortKey, dir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  // Export handlers
  const exportToCsv = () => {
    const headers = ["Commodity", "Market", "State", "Collector", "Modal Price (INR/Q)", "Min Price", "Max Price", "Arrival Qty", "Recorded At"];
    const rows = filtered.map((p) => [
      p.commodity,
      p.market,
      getState(p.collectorName),
      p.collectorName,
      p.modalPrice,
      p.minPrice,
      p.maxPrice,
      p.arrivalQty,
      p.recordedAt,
    ]);
    const content = [headers.join(","), ...rows.map((r) => r.map(val => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mandipulse_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJson = () => {
    const content = JSON.stringify(filtered, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mandipulse_export_${new Date().toISOString().slice(0,10)}.json`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
    alert("JSON price ticks data copied to clipboard!");
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="border-b border-border px-4 py-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-medium">Price board</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length === prices.length
                ? `${prices.length} commodities tracked`
                : `Showing ${filtered.length} of ${prices.length} filtered commodities`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToCsv}
              disabled={filtered.length === 0}
              className="rounded bg-muted hover:bg-muted/80 px-2.5 py-1 text-xs font-mono disabled:opacity-50"
            >
              CSV
            </button>
            <button
              onClick={exportToJson}
              disabled={filtered.length === 0}
              className="rounded bg-muted hover:bg-muted/80 px-2.5 py-1 text-xs font-mono disabled:opacity-50"
            >
              JSON
            </button>
            <button
              onClick={copyJson}
              disabled={filtered.length === 0}
              className="rounded bg-muted hover:bg-muted/80 px-2.5 py-1 text-xs font-mono disabled:opacity-50"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Multi-Filters Grid */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search commodity..."
            className="h-8 text-xs"
          />
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Markets</option>
            {uniqueMarkets.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All States</option>
            {uniqueStates.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase font-mono">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[10px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase font-mono">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[10px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto min-w-0">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground animate-none">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button type="button" onClick={() => toggle("commodity")} className="hover:text-foreground">
                    Commodity {sortKey === "commodity" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 text-right font-medium">Trend</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggle("modalPrice")} className="hover:text-foreground">
                    Modal (INR/Q) {sortKey === "modalPrice" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Range</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggle("arrivalQty")} className="hover:text-foreground">
                    Arrival (Q) {sortKey === "arrivalQty" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggle("recordedAt")} className="hover:text-foreground">
                    Date {sortKey === "recordedAt" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    {prices.length === 0 ? "No ticks recorded yet." : "No commodities match the selected filter criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((price) => {
                  let trendPercent = 0;
                  if (price.previousModalPrice && price.previousModalPrice > 0) {
                    trendPercent = ((price.modalPrice - price.previousModalPrice) / price.previousModalPrice) * 100;
                  }
                  
                  return (
                    <tr key={price.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div 
                          className="font-serif text-base font-medium capitalize text-foreground cursor-help"
                          title={price.commodity}
                        >
                          {price.commodity}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{getState(price.collectorName)}</span>
                          <span className="text-[10px] text-muted-foreground/60">•</span>
                          <span>{price.collectorName}</span>
                          {price.collectorStatus && (
                            <Badge tone={statusTone(price.collectorStatus)}>
                              {price.collectorStatus}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-serif">{price.market}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Sparkline current={price.modalPrice} previous={price.previousModalPrice} />
                          {price.previousModalPrice ? (
                            <span className={`text-xs font-mono tabular-nums font-semibold ${trendPercent >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {trendPercent >= 0 ? "+" : ""}{trendPercent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground/50">N/A</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums text-foreground">
                        {formatInr(price.modalPrice)}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                        {formatInr(price.minPrice)}–{formatInr(price.maxPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatQty(price.arrivalQty)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(price.recordedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
