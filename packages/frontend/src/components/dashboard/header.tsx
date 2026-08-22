import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useApiStatus } from '@/hooks/use-api-status'
import { apiFetch } from '@/lib/api'
import { useSSE } from '@/hooks/use-sse'

interface SimulateResponse {
  incidentId?: string
  outcome?: string
  gradeScore?: number | null
  error?: string
}

type OutcomeFlash = 'APPROVED' | 'ESCALATED' | null

function HeartbeatDot() {
  const { status } = useSSE({ filter: () => false })
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-widest text-healthy">
        <span className="h-2 w-2 animate-heartbeat rounded-full bg-healthy" />
        LIVE
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-widest ${
        status === 'error' ? 'text-failed' : 'text-degraded'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === 'error' ? 'bg-failed' : 'animate-heartbeat bg-degraded'
        }`}
      />
      {status === 'error' ? 'RECONNECTING…' : 'CONNECTING'}
    </span>
  )
}

export function Header() {
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [flash, setFlash] = useState<OutcomeFlash>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apiStatus = useApiStatus()

  function flashOutcome(outcome: string | undefined): void {
    if (outcome !== 'APPROVED' && outcome !== 'ESCALATED') return
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash(outcome)
    flashTimer.current = setTimeout(() => setFlash(null), 1600)
  }

  async function simulate() {
    if (sending) return
    setSending(true)
    setFeedback(null)
    try {
      const response = await apiFetch('/api/simulate-drift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectorKey: 'mumbai_apmc' }),
      })
      const body = (await response.json()) as SimulateResponse
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      const score =
        typeof body.gradeScore === 'number' ? ` · grade ${body.gradeScore.toFixed(2)}` : ''
      flashOutcome(body.outcome)
      setFeedback({
        kind: body.outcome === 'ESCALATED' ? 'error' : 'ok',
        text: `drift simulated · ${String(body.incidentId ?? '').slice(0, 8)}… · ${body.outcome ?? 'healing'}${score}`,
      })
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'request failed',
      })
    } finally {
      setSending(false)
    }
  }

  const buttonFlash =
    flash === 'APPROVED'
      ? 'ring-2 ring-healthy shadow-[0_0_18px_-4px] shadow-healthy/60'
      : flash === 'ESCALATED'
        ? 'ring-2 ring-failed shadow-[0_0_18px_-4px] shadow-failed/60'
        : ''

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight">Mandipulse</h1>
          <p className="text-xs text-muted-foreground">scraping watchdog &amp; self-healing</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] font-semibold tracking-wide ${
              apiStatus === 'down'
                ? 'border-failed/40 bg-failed/10 text-failed'
                : 'border-healthy/30 bg-healthy/10 text-healthy'
            }`}
            title={
              apiStatus === 'down'
                ? 'A core API request (collectors/prices/incidents) recently failed'
                : 'Core API requests are succeeding'
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                apiStatus === 'down'
                  ? 'animate-heartbeat bg-failed'
                  : apiStatus === 'up'
                    ? 'bg-healthy'
                    : 'bg-degraded'
              }`}
            />
            {apiStatus === 'down' ? 'API UNREACHABLE' : 'API'}
          </span>
          <HeartbeatDot />
          <Button
            onClick={() => void simulate()}
            disabled={sending}
            className={`font-semibold transition-all duration-300 ${buttonFlash}`}
            title="Injects a synthetic schema drift on the Mumbai APMC collector and replays the captured real heal"
          >
            {sending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Incident in progress…
              </span>
            ) : (
              '⚡ Simulate Drift'
            )}
          </Button>
        </div>
      </div>
      {feedback && (
        <p
          className={`mx-auto max-w-7xl px-4 pb-2 text-xs ${
            feedback.kind === 'ok' ? 'text-healthy' : 'text-failed'
          }`}
        >
          <span className="font-mono">{feedback.text}</span>
        </p>
      )}
    </header>
  )
}
