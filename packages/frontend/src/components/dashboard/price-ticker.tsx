import { useEffect, useMemo, useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { apiUrl } from '@/lib/api'

interface PriceRow {
  id: string
  collectorId: string
  collectorName: string
  commodity: string
  market: string
  modalPrice: number
  previousModalPrice: number | null
  recordedAt: string
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function PriceTicker() {
  const [prices, setPrices] = useState<PriceRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(apiUrl('/api/prices'))
        if (!response.ok) return
        const rows = (await response.json()) as PriceRow[]
        if (!cancelled) setPrices(rows)
      } catch {
        // keep previous data
      }
    }
    void load()
    const interval = setInterval(() => void load(), 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const items = useMemo(
    () =>
      prices.map((price) => {
        const delta =
          price.previousModalPrice === null ? null : price.modalPrice - price.previousModalPrice
        return { price, delta }
      }),
    [prices],
  )

  if (items.length === 0)
    return (
      <Card className="overflow-hidden rounded-none border-x-0 border-t-0">
        <CardContent className="flex items-center py-2">
          <span className="mr-3 shrink-0 border-r border-border pr-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Live
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-degraded" />
            No ticks yet — waiting for first scrape
          </span>
        </CardContent>
      </Card>
    )

  const strip = [...items, ...items]

  return (
    <Card className="overflow-hidden rounded-none border-x-0 border-t-0">
      <CardContent className="flex items-center overflow-hidden py-2">
        <span className="mr-3 shrink-0 border-r border-border pr-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Live
        </span>
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="flex shrink-0 animate-ticker gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
            {strip.map(({ price, delta }, index) => (
              <span key={index} className="text-sm text-foreground">
                {price.commodity} {inr.format(price.modalPrice)}
                {delta !== null && delta !== 0 && (
                  <span
                    className={`ml-1 font-mono text-xs font-semibold ${
                      delta > 0 ? 'text-healthy' : 'text-failed'
                    }`}
                  >
                    {delta > 0 ? '▲' : '▼'}
                    {inr.format(Math.abs(delta))}
                  </span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {price.collectorName} · {price.market}
                </span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
