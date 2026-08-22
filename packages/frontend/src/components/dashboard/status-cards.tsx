import type { Collector, PriceRow } from "@/lib/api";
import { Badge, statusTone } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }

  if (collectors.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        No collectors in the registry.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {collectors.map((collector) => {
        const ticks = prices.filter((p) => p.collectorId === collector.id);
        const newest = ticks[0];
        const pending = collector.status === "PENDING_SETUP";
        return (
          <article
            key={collector.id}
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-panel)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-xl font-medium leading-snug">{collector.name}</h2>
              <Badge tone={statusTone(collector.status)}>{collector.status.replaceAll("_", " ")}</Badge>
            </div>
            {pending ? (
              <p className="mt-3 text-sm text-muted-foreground">Awaiting collector creation.</p>
            ) : newest ? (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">{ticks.length}</span>{" "}
                commodities · last tick {relativeTime(newest.recordedAt)}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Awaiting first scrape.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
