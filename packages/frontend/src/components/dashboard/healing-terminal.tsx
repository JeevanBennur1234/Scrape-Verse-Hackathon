import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { GradeBadge, type RepairChecks } from '@/components/grade-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSSE, type SseEvent } from '@/hooks/use-sse'

const HEAL_FILTER = (type: string): boolean =>
  type.startsWith('heal.') ||
  type === 'incident.simulated' ||
  type === 'drift.simulated'

type Tone = 'detect' | 'heal' | 'grade' | 'recovered' | 'escalated' | 'simulated' | 'pending'

const TONE_STYLES: Record<Tone, string> = {
  detect: 'border-failed/40 bg-failed/10 text-failed',
  heal: 'border-healing/40 bg-healing/10 text-healing',
  grade: 'border-degraded/40 bg-degraded/10 text-degraded',
  recovered: 'border-healthy/40 bg-healthy/10 text-healthy',
  escalated: 'border-failed/60 bg-failed/25 text-failed',
  simulated: 'border-simulated/50 bg-simulated/15 text-simulated',
  pending: 'border-neutral-600 bg-neutral-800/60 text-neutral-300',
}

interface IncidentTrace {
  incidentId: string
  simulated?: boolean
  detect?: SseEvent
  heal?: SseEvent
  grade?: SseEvent
  resolution?: SseEvent
  resolutionTone?: 'recovered' | 'escalated'
  events: SseEvent[]
}

export function HealingTerminal() {
  const { events, status } = useSSE({ filter: HEAL_FILTER })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [events])

  const traces = buildTraces(events)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border bg-muted/50 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-failed" />
          <span className="h-3 w-3 rounded-full bg-degraded" />
          <span className="h-3 w-3 rounded-full bg-healthy" />
          <CardTitle className="ml-2 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            HealingTerminal
          </CardTitle>
        </div>
        <span
          className={`h-2 w-2 animate-heartbeat rounded-full ${
            status === 'open' ? 'bg-healthy' : status === 'error' ? 'bg-failed' : 'bg-degraded'
          }`}
          title={`sse: ${status}`}
        />
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-72 overflow-y-auto bg-black p-3 font-mono text-xs leading-relaxed"
        >
          {traces.length === 0 ? (
            <p className="text-neutral-500">
              Click ⚡ Simulate Drift to watch DETECT → HEAL → GRADE → RECOVERED
            </p>
          ) : (
            traces.map((trace) => <IncidentBlock key={trace.incidentId} trace={trace} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function IncidentBlock({ trace }: { trace: IncidentTrace }) {
  const reduce = useReducedMotion()
  const gradePayload = trace.grade?.payload as { score?: number; checks?: RepairChecks } | undefined

  const renderedLines = trace.events
    .map((event) => ({ event, line: formatLine(event) }))
    .filter((entry): entry is { event: SseEvent; line: TerminalLine } => entry.line !== null)

  return (
    <div className="mb-3 border-b border-neutral-800 pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {trace.simulated && <StageBadge label="SIMULATED" tone="simulated" />}
        {trace.detect && <StageBadge label="DETECT" tone="detect" event={trace.detect} />}
        {trace.heal && (
          <>
            <Arrow />
            <StageBadge label="HEAL" tone="heal" event={trace.heal} />
          </>
        )}
        {trace.grade && (
          <>
            <Arrow />
            <StageBadge label="GRADE" tone="grade" event={trace.grade} />
            <GradeBadge score={gradePayload?.score ?? 0} checks={gradePayload?.checks} />
          </>
        )}
        {trace.resolution && trace.resolutionTone ? (
          <>
            <Arrow />
            <StageBadge
              label={trace.resolutionTone === 'recovered' ? 'RECOVERED' : 'ESCALATED'}
              tone={trace.resolutionTone}
              event={trace.resolution}
            />
          </>
        ) : (
          trace.grade && (
            <>
              <Arrow />
              <StageBadge label="IN FLIGHT" tone="pending" pulse />
            </>
          )
        )}
      </div>
      <div className="mt-1.5 space-y-0.5">
        <AnimatePresence initial={false}>
          {renderedLines.map(({ event, line }) => {
            const recovered = event.type === 'heal.recovered'
            const celebrate = recovered && !reduce
            return (
              <motion.p
                key={line.key}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  ...(celebrate
                    ? {
                        scale: [1, 1.02, 1],
                        boxShadow: [
                          '0 0 0px 0 rgba(52, 211, 153, 0)',
                          '0 0 16px 2px rgba(52, 211, 153, 0.35)',
                          '0 0 0px 0 rgba(52, 211, 153, 0)',
                        ],
                      }
                    : {}),
                }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={
                  celebrate
                    ? {
                        opacity: { duration: 0.2 },
                        y: { duration: 0.2 },
                        scale: { duration: 0.9, delay: 0.15 },
                        boxShadow: { duration: 1.3, delay: 0.15 },
                      }
                    : { duration: 0.2, ease: 'easeOut' }
                }
                className={`whitespace-pre-wrap rounded-r-sm border-l-2 py-0.5 pl-2 ${accentFor(event)}`}
              >
                <span className="text-neutral-600">{line.time}</span>{' '}
                <span className={line.className}>{line.text}</span>
              </motion.p>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Arrow() {
  return <span className="text-neutral-600">→</span>
}

function StageBadge({
  label,
  tone,
  event,
  pulse = false,
}: {
  label: string
  tone: Tone
  event?: SseEvent
  pulse?: boolean
}) {
  const time = event
    ? new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })
    : undefined
  return (
    <span
      className={`inline-flex flex-col items-start rounded-md border px-2 py-1 leading-tight ${TONE_STYLES[tone]} ${
        pulse ? 'animate-pulse' : ''
      }`}
    >
      <span className="text-[11px] font-bold tracking-wide">{label}</span>
      {time && <span className="text-[9px] font-normal tabular-nums opacity-80">{time}</span>}
    </span>
  )
}

function buildTraces(events: SseEvent[]): IncidentTrace[] {
  const byIncident = new Map<string, IncidentTrace>()
  for (const event of events) {
    const payload = event.payload as { incidentId?: string; simulated?: boolean }
    const incidentId = String(payload.incidentId ?? '')
    if (!incidentId) continue
    const trace = byIncident.get(incidentId) ?? { incidentId, events: [] as SseEvent[] }
    trace.events.push(event)
    if (payload.simulated === true) trace.simulated = true
    if (event.type === 'incident.simulated' || event.type === 'drift.simulated' || event.type === 'heal.started') {
      trace.detect ??= event
    }
    if (event.type === 'heal.cli.started') trace.heal ??= event
    if (event.type === 'heal.repair.graded' || event.type === 'heal.graded') trace.grade ??= event
    if (event.type === 'heal.recovered') {
      trace.resolution = event
      trace.resolutionTone = 'recovered'
    }
    if (event.type === 'heal.escalated' || event.type === 'heal.failed') {
      trace.resolution ??= event
      trace.resolutionTone = 'escalated'
    }
    byIncident.set(incidentId, trace)
  }
  return [...byIncident.values()].sort(
    (a, b) =>
      new Date(b.detect?.timestamp ?? 0).getTime() - new Date(a.detect?.timestamp ?? 0).getTime(),
  )
}

interface TerminalLine {
  key: string
  time: string
  text: string
  className: string
}

function accentFor(event: SseEvent): string {
  const payload = event.payload as Record<string, unknown>
  if (payload.simulated === true) return 'border-l-simulated'
  switch (event.type) {
    case 'heal.started':
    case 'heal.diagnosis':
    case 'heal.cli.started':
      return 'border-l-healing'
    case 'heal.cli.completed':
    case 'heal.approved':
    case 'heal.recovered':
      return 'border-l-healthy'
    case 'heal.repair.graded':
    case 'heal.graded':
      return payload.approved ? 'border-l-healthy' : 'border-l-failed'
    case 'heal.cli.failed':
    case 'heal.escalated':
    case 'heal.failed':
      return 'border-l-failed'
    default:
      return 'border-l-transparent'
  }
}

function formatLine(event: SseEvent): TerminalLine | null {
  const time = new Date(event.timestamp).toLocaleTimeString('en-IN', { hour12: false })
  const payload = event.payload as Record<string, unknown>
  const base: TerminalLine = { key: event.id, time, text: '', className: 'text-neutral-300' }

  switch (event.type) {
    case 'incident.simulated':
      return {
        ...base,
        text: `incident.simulated ${String(payload.incidentId)} — ${String(payload.diagnosis).slice(0, 140)}…`,
        className: 'text-simulated',
      }
    case 'heal.started':
      return {
        ...base,
        text: `heal.started ${String(payload.collectorId)} [${String(payload.type)}]`,
        className: 'text-healing',
      }
    case 'heal.diagnosis':
      return {
        ...base,
        text: `heal.diagnosis prompt (${String(payload.prompt).length} chars)`,
        className: 'text-healing',
      }
    case 'heal.cli.started':
      return {
        ...base,
        text: `cli.started bdata scraper heal ${String(payload.collectorId)}`,
        className: 'text-degraded',
      }
    case 'heal.cli.completed':
      return {
        ...base,
        text: `cli.completed ok (${String(payload.output).length} chars)`,
        className: 'text-healthy',
      }
    case 'heal.cli.failed':
      return { ...base, text: `cli.failed ${String(payload.error)}`, className: 'text-failed' }
    case 'heal.repair.parsed':
      return {
        ...base,
        text: `repair.parsed ${
          payload.preview
            ? `${String((payload.preview as { rowCount?: number }).rowCount ?? '?')} rows`
            : 'NO PREVIEW'
        }`,
        className: 'text-degraded',
      }
    case 'heal.repair.graded':
    case 'heal.graded':
      return {
        ...base,
        text: `${event.type} ${String(payload.score)} ${payload.approved ? 'PASS' : 'FAIL'}${
          payload.hardGateFailed ? ` [hard gate failed: ${String(payload.hardGateFailed)}]` : ''
        }`,
        className: payload.approved ? 'text-healthy' : 'text-failed',
      }
    case 'heal.approved':
      return {
        ...base,
        text: `grade approved → issuing bdata scraper approve`,
        className: 'text-healthy',
      }
    case 'heal.recovered':
      return {
        ...base,
        text: `RECOVERED ✓ incident resolved at ${String(payload.approvedAt)}${
          payload.approvalSkipped ? ` [${String(payload.approvalSkipped)}]` : ''
        }`,
        className: 'text-healthy font-bold',
      }
    case 'heal.escalated':
      return {
        ...base,
        text: `ESCALATED — ${String(payload.reason)}`,
        className: 'text-failed font-bold',
      }
    case 'heal.failed':
      return {
        ...base,
        text: `FAILED ${String(payload.reason)}`,
        className: 'text-failed font-bold',
      }
    default:
      return null
  }
}
