import { useCallback, useEffect, useState } from "react";
import type { Collector, IncidentRow, PriceRow } from "@/lib/api";
import { dedupeCollectors } from "@/lib/format";
import { apiFetch } from "@/lib/api";

type Board = {
  collectors: Collector[];
  prices: PriceRow[];
  incidents: IncidentRow[];
  loading: boolean;
  reachable: boolean;
};

const empty: Board = {
  collectors: [],
  prices: [],
  incidents: [],
  loading: true,
  reachable: true,
};

export function useBoard() {
  const [board, setBoard] = useState<Board>(empty);

  const load = useCallback(async () => {
    try {
      const [cRes, pRes, iRes] = await Promise.all([
        apiFetch("/api/collectors"),
        apiFetch("/api/prices"),
        apiFetch("/api/incidents?limit=20"),
      ]);
      if (!cRes.ok || !pRes.ok) {
        setBoard((prev) => ({ ...prev, loading: false, reachable: false }));
        return;
      }
      const [collectors, prices, incidents] = await Promise.all([
        cRes.json() as Promise<Collector[]>,
        pRes.json() as Promise<PriceRow[]>,
        iRes.ok ? (iRes.json() as Promise<IncidentRow[]>) : Promise.resolve([]),
      ]);
      setBoard({
        collectors: dedupeCollectors(Array.isArray(collectors) ? collectors : []) as Collector[],
        prices: Array.isArray(prices) ? prices : [],
        incidents: Array.isArray(incidents) ? incidents : [],
        loading: false,
        reachable: true,
      });
    } catch {
      setBoard((prev) => ({ ...prev, loading: false, reachable: false }));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20000);
    return () => clearInterval(id);
  }, [load]);

  return { ...board, reload: load };
}
