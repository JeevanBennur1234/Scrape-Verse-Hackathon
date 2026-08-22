import { useMemo, useState } from "react";
import type { PriceRow } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatInr, formatQty } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "commodity" | "modalPrice" | "arrivalQty";

export function MandiTable({ prices, loading }: { prices: PriceRow[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("commodity");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle
      ? prices.filter((p) =>
          `${p.commodity} ${p.market} ${p.collectorName}`.toLowerCase().includes(needle),
        )
      : prices;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "en");
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [prices, q, sortKey, dir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-medium">Price board</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? `Showing ${filtered.length} of ${prices.length}`
              : `${prices.length} commodities · click a heading to sort`}
          </p>
        </div>
        <Input
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          placeholder="Filter commodity or market"
          aria-label="Filter commodity or market"
          className="sm:max-w-64"
        />
      </div>
      <div className="overflow-x-auto min-w-0">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted-foreground animate-none">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button type="button" onClick={() => toggle("commodity")} className="hover:text-foreground">
                    Commodity {sortKey === "commodity" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggle("modalPrice")} className="hover:text-foreground">
                    Modal {sortKey === "modalPrice" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Range</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggle("arrivalQty")} className="hover:text-foreground">
                    Arrival {sortKey === "arrivalQty" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {prices.length === 0 ? "No ticks yet." : "No commodities match."}
                  </td>
                </tr>
              ) : (
                filtered.map((price) => (
                  <tr key={price.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <div className="font-serif text-base font-medium capitalize text-foreground">
                        {price.commodity}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{price.collectorName}</span>
                        <Badge tone={statusTone(price.collectorStatus ?? "IDLE")}>
                          {price.collectorStatus ?? "IDLE"}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{price.market}</td>
                    <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums text-foreground">
                      {formatInr(price.modalPrice)}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                      {formatInr(price.minPrice)}–{formatInr(price.maxPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatQty(price.arrivalQty)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
