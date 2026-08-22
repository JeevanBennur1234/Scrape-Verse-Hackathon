import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { apiUrl } from '@/lib/api'

import { useSSE } from '@/hooks/use-sse'
import { relativeTime, useNowTick } from '@/hooks/use-now'

interface CollectorRow {
  id: string
  name: string
  status: string
}

interface PriceRow {
  id: string
  collectorId: string
  modalPrice: number
  recordedAt: string
}

interface IncidentRow {
  id: string
  collectorId: string
  status: string
  createdAt: string
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'HEALTHY':
      return 'border-healthy/40 bg-healthy/10 text-healthy'
    case 'DEGRADED':
      return 'border-degraded/40 bg-degraded/10 text-degraded'
    case 'FAILING':
      return 'border-failed/40 bg-failed/15 text-failed'
    case 'PENDING_SETUP':
      return 'border-muted-foreground/30 bg-muted text-muted-foreground'
    default:
      return 'border-healing/40 bg-healing/10 text-healing'
  }
}

function isHealing(status: string): boolean {
  return status === 'HEALING'
}

export function StatusCards() {
  const [collectors, setCollectors] = useState<CollectorRow[]>([])
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const now = useNowTick(1000)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [collectorRes, priceRes] = await Promise.all([
          fetch(apiUrl('/api/collectors')),
          fetch(apiUrl('/api/prices')),
        ])
        if (!collectorRes.ok || !priceRes.ok) return
        const [cols, rows] = await Promise.all([
          collectorRes.json() as Promise<CollectorRow[]>,
          priceRes.json() as Promise<PriceRow[]>,
        ])
        if (!cancelled) {
          setCollectors(cols)
          setPrices(rows)
        }
      } catch {
        // keep previous data
      }
    }
    void load()
    const interval = setInterval(() => void load(), 15_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const { events } = useSSE({
    filter: (type) => type === 'heal.recovered' || type === 'heal.escalated',
  })

  useEffect(() => {
    if (events.length === 0) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(apiUrl('/api/incidents?limit=100'))
          if (!response.ok) return
          setIncidents((await response.json()) as IncidentRow[])
        } catch {
          // keep previous data
        }
      })()
    }, 500)
    return () => clearTimeout(timer)
  }, [events])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(apiUrl('/api/incidents?limit=100'))
        if (!response.ok) return
        const rows = (await response.json()) as IncidentRow[]
        if (!cancelled) setIncidents(rows)
      } catch {
        // keep previous data
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const latestByCollector = useMemo(() => {
    const byCollector = new Map<string, PriceRow>()
    for (const price of prices) {
      const current = byCollector.get(price.collectorId)
      if (!current || new Date(price.recordedAt) > new Date(current.recordedAt)) {
        byCollector.set(price.collectorId, price)
      }
    }
    return byCollector
  }, [prices])

  const resolvedTodayByCollector = useMemo(() => {
    const today = new Date().toDateString()
    const counts = new Map<string, number>()
    for (const incident of incidents) {
      if (incident.status !== 'RECOVERED') continue
      if (new Date(incident.createdAt).toDateString() !== today) continue
      counts.set(incident.collectorId, (counts.get(incident.collectorId) ?? 0) + 1)
    }
    return counts
  }, [incidents])

  if (collectors.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {collectors.map((collector) => {
        const latest = latestByCollector.get(collector.id)
        const resolvedToday = resolvedTodayByCollector.get(collector.id) ?? 0
        const pending = collector.status === 'PENDING_SETUP'
        return (
          <Card
            key={collector.id}
            className={`rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
              pending ? 'opacity-60' : ''
            }`}
          >
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{collector.name}</span>
                <Badge variant="outline" className={`gap-1.5 ${statusBadgeClass(collector.status)}`}>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isHealing(collector.status)
                        ? 'animate-heartbeat bg-healing'
                        : collector.status === 'HEALTHY'
                          ? 'bg-healthy'
                          : collector.status === 'DEGRADED'
                            ? 'bg-degraded'
                            : collector.status === 'FAILING'
                              ? 'bg-failed'
                              : 'bg-muted-foreground'
                    }`}
                  />
                  {collector.status}
                </Badge>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                {latest ? (
                  <>
                    <span className="text-xl font-semibold tabular-nums">
                      {inr.format(latest.modalPrice)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground" title={latest.recordedAt}>
                      {relativeTime(latest.recordedAt, now)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">awaiting first scrape</span>
                )}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {resolvedToday} incident{resolvedToday === 1 ? '' : 's'} resolved today
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
