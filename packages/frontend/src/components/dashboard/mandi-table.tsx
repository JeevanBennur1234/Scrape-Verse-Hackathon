import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeTime, useNowTick } from '@/hooks/use-now'
import { apiFetch } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface CollectorRow {
  id: string
  name: string
  status: string
}

interface PriceRow {
  id: string
  collectorId: string
  collectorName: string
  collectorStatus?: string
  commodity: string
  market: string
  modalPrice: number
  minPrice: number
  maxPrice: number
  arrivalQty: number
  recordedAt: string
}

type SortKey = 'commodity' | 'market' | 'collectorName' | 'modalPrice' | 'minPrice' | 'maxPrice' | 'arrivalQty'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const qty = new Intl.NumberFormat('en-IN')

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'commodity', label: 'Commodity' },
  { key: 'market', label: 'Market' },
  { key: 'collectorName', label: 'Collector' },
  { key: 'modalPrice', label: 'Modal', numeric: true },
  { key: 'minPrice', label: 'Min', numeric: true },
  { key: 'maxPrice', label: 'Max', numeric: true },
  { key: 'arrivalQty', label: 'Arrival Qty', numeric: true },
]

function healthBadgeClass(status?: string): string {
  switch (status) {
    case 'HEALTHY':
      return 'border-healthy/40 bg-healthy/10 text-healthy'
    case 'DEGRADED':
      return 'border-degraded/40 bg-degraded/10 text-degraded'
    case 'FAILING':
      return 'border-failed/40 bg-failed/15 text-failed'
    default:
      return 'border-muted-foreground/30 bg-muted text-muted-foreground'
  }
}

export function MandiTable() {
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [collectors, setCollectors] = useState<CollectorRow[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('commodity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const now = useNowTick(1000)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [priceRes, collectorRes] = await Promise.all([
          apiFetch('/api/prices'),
          apiFetch('/api/collectors'),
        ])
        if (!priceRes.ok || !collectorRes.ok) return
        const [rows, cols] = await Promise.all([
          priceRes.json() as Promise<PriceRow[]>,
          collectorRes.json() as Promise<CollectorRow[]>,
        ])
        if (!cancelled) {
          setPrices(rows)
          setCollectors(cols)
          setUpdatedAt(new Date())
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

  const [filterText, setFilterText] = useState('')

  const filtered = useMemo(() => {
    if (!filterText.trim()) return prices
    const query = filterText.toLowerCase()
    return prices.filter((price) => {
      return (
        price.commodity.toLowerCase().includes(query) ||
        price.market.toLowerCase().includes(query) ||
        price.collectorName.toLowerCase().includes(query)
      )
    })
  }, [prices, filterText])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const pendingCollectors = useMemo(
    () => collectors.filter((c) => c.status === 'PENDING_SETUP'),
    [collectors],
  )

  function toggleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Mandi Prices</CardTitle>
        <CardDescription>
          Latest modal price per collector and commodity — click a column to sort
          {updatedAt
            ? ` · updated ${updatedAt.toLocaleTimeString('en-IN', { hour12: false })}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <input
            type="text"
            placeholder="Filter commodity or market..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full sm:max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {filterText && (
            <span className="text-xs text-muted-foreground font-mono">
              Showing {sorted.length} of {prices.length} rows
            </span>
          )}
        </div>
        <div className="overflow-x-auto min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    className={`cursor-pointer select-none hover:text-foreground ${
                      column.numeric ? 'text-right' : ''
                    }`}
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    {sortKey === column.key && (
                      <span className="ml-1 text-muted-foreground">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                filterText.trim() ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="py-8 text-center text-muted-foreground">
                      No commodities match
                    </TableCell>
                  </TableRow>
                ) : collectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="py-8 text-center text-muted-foreground">
                      Loading collectors…
                    </TableCell>
                  </TableRow>
                ) : (
                  collectors
                    .filter((c) => c.status !== 'PENDING_SETUP')
                    .map((c) => (
                      <TableRow key={c.id}>
                        <TableCell colSpan={COLUMNS.length} className="py-4 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-degraded" />
                            <span className="font-medium text-foreground">{c.name}</span>
                            — no ticks yet, waiting for first scrape
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                )
              ) : (
                sorted.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell className="font-medium capitalize">{price.commodity}</TableCell>
                    <TableCell>{price.market}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-muted-foreground">{price.collectorName}</span>
                        <Badge
                          variant="outline"
                          className={`px-1 py-0 text-[9px] uppercase ${healthBadgeClass(price.collectorStatus)}`}
                        >
                          {price.collectorStatus ?? 'IDLE'}
                        </Badge>
                        <span
                          className="hidden sm:inline font-mono text-[10px] tabular-nums text-muted-foreground"
                          title={price.recordedAt}
                        >
                          last tick: {relativeTime(price.recordedAt, now)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {inr.format(price.modalPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {inr.format(price.minPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {inr.format(price.maxPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {qty.format(price.arrivalQty)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {pendingCollectors.map((c) => (
                <TableRow key={c.id} className="bg-muted/30">
                  <TableCell colSpan={COLUMNS.length} className="py-2.5 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-degraded" />
                      <span className="font-medium text-foreground">{c.name}</span>
                      — awaiting collector creation
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
