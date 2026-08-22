const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const qty = new Intl.NumberFormat("en-IN");

export function formatInr(n: number): string {
  return inr.format(n);
}

export function formatQty(n: number): string {
  return qty.format(n);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = Math.max(0, now - then);
  const min = Math.floor(delta / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour12: false });
}

export function snapshotLabel(iso: string | null): string {
  if (!iso) return "No scrape yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const ageH = (Date.now() - d.getTime()) / 36e5;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  if (ageH > 6) return `Snapshot · ${date}`;
  return "Live board";
}

export function dedupeCollectors(rows: CollectorLike[]): CollectorLike[] {
  const seen = new Set<string>();
  const out: CollectorLike[] = [];
  for (const row of rows) {
    const key = `${row.name}|${row.portalUrl}`;
    if (seen.has(key) || seen.has(row.id)) continue;
    seen.add(key);
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

type CollectorLike = { id: string; name: string; portalUrl: string; status: string };
