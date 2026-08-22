import { useEffect, useState } from 'react'

import { GradeBadge, type RepairChecks } from '@/components/grade-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'

import { useSSE } from '@/hooks/use-sse'

interface GradeRow {
  id: string
  score: number
  reason: string
  checks?: RepairChecks
  createdAt: string
}

interface IncidentRow {
  id: string
  collectorId: string
  type: 'SCHEMA_DRIFT' | 'NULL_SPIKE' | 'PRICE_OUTLIER'
  field: string
  symptom: string
  affectedRatio: number
  status: 'DETECTED' | 'HEALING' | 'GRADED' | 'RECOVERED' | 'ESCALATED'
  createdAt: string
  grades: GradeRow[]
}

const typeStyles: Record<IncidentRow['type'], string> = {
  SCHEMA_DRIFT: 'bg-degraded/15 text-degraded border-degraded/30',
  NULL_SPIKE: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  PRICE_OUTLIER: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
}

const statusStyles: Record<IncidentRow['status'], string> = {
  DETECTED: 'border-failed/40 bg-failed/10 text-failed',
  HEALING: 'border-healing/40 bg-healing/10 text-healing',
  GRADED: 'border-degraded/40 bg-degraded/10 text-degraded',
  RECOVERED: 'border-healthy/40 bg-healthy/10 text-healthy',
  ESCALATED: 'bg-destructive/15 text-destructive border-destructive/30',
}

export function IncidentTimeline() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const { events } = useSSE({
    filter: (type) =>
      type.startsWith('heal.') || type === 'incident.simulated' || type === 'drift.simulated',
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch('/api/incidents?limit=20')
        if (!response.ok) return
        const rows = (await response.json()) as IncidentRow[]
        if (!cancelled) setIncidents(rows)
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

  useEffect(() => {
    if (events.length === 0) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await apiFetch('/api/incidents?limit=20')
          if (!response.ok) return
          setIncidents((await response.json()) as IncidentRow[])
        } catch {
          // keep previous data
        }
      })()
    }, 500)
    return () => clearTimeout(timer)
  }, [events])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Incident Timeline</CardTitle>
        <CardDescription>Latest detected incidents and their grades</CardDescription>
      </CardHeader>
      <CardContent className="max-h-72 space-y-2 overflow-y-auto">
        {incidents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No incidents yet</p>
        ) : (
          incidents.map((incident) => {
            const latestGrade = incident.grades[0]
            const isSimulated =
              incident.symptom.includes('[SIMULATED]') || incident.symptom.includes('Simulated')
            return (
              <div key={incident.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={typeStyles[incident.type]}>
                    {incident.type}
                  </Badge>
                  <Badge variant="outline" className={statusStyles[incident.status]}>
                    {incident.status}
                  </Badge>
                  {isSimulated && (
                    <Badge
                      variant="outline"
                      className="border-simulated/50 bg-simulated/15 text-simulated"
                      title="This incident was produced by the simulate-drift replay, not a live portal scrape"
                    >
                      SIMULATED
                    </Badge>
                  )}
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(incident.createdAt).toLocaleTimeString('en-IN', { hour12: false })}
                  </span>
                </div>
                <p className="mt-2 text-sm">{incident.symptom}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  field: {incident.field} · affected ratio:{' '}
                  {(incident.affectedRatio * 100).toFixed(0)}%
                </p>
                {latestGrade && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <GradeBadge score={latestGrade.score} checks={latestGrade.checks} />
                    <span className="mt-1 block">{latestGrade.reason}</span>
                  </p>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
