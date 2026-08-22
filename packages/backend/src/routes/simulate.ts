import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { runBdataHeal } from '../brightdata/cli.js'
import {
  COLLECTORS,
  MANDI_COLLECTORS,
  hasRealCollectorId,
} from '../collectors/mandi-registry.js'
import { prisma } from '../db.js'
import { eventBus } from '../events/pubsub.js'
import {
  GENUINE_HEAL_THRESHOLD,
  gradeGenuineHealPreview,
  type GenuineHealGradeReport,
} from '../grader/repairGrader.js'
import { expandRows } from '../watchdog/fieldMapper.js'
import { buildStaleArchiveHealDiagnosis } from '../watchdog/healingEngine.js'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..', '..')
const PROOF_PATH = path.join(BACKEND_ROOT, 'seed-data', 'genuine-heal-mumbai.json')

const SIMULATED_DRIFT_KIND = 'STALE_ARCHIVE_DATE'
const LIVE_CLI_TIMEOUT_SECONDS = 15
const LIVE_CLI_TIMEOUT_MS = LIVE_CLI_TIMEOUT_SECONDS * 1000

interface SimulateDriftBody {
  collectorKey?: string
  collectorId?: string
  key?: string
}

interface RateLimitInfo {
  tokens: number
  lastRefill: number
}

const limiters = new Map<string, RateLimitInfo>()
const MAX_TOKENS = 2
const REFILL_RATE_PER_MS = 5 / (10 * 60 * 1000)

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const info = limiters.get(ip) ?? { tokens: MAX_TOKENS, lastRefill: now }
  const elapsed = now - info.lastRefill
  const refilled = elapsed * REFILL_RATE_PER_MS
  const tokens = Math.min(MAX_TOKENS, info.tokens + refilled)
  if (tokens >= 1) {
    limiters.set(ip, { tokens: tokens - 1, lastRefill: now })
    return true
  }
  limiters.set(ip, { tokens, lastRefill: now })
  return false
}

interface CapturedArtifact {
  envelope?: {
    status?: string
    preview_result?: unknown
    diff_summary?: string
    next_step?: string
  }
}

type EnvelopeShape = NonNullable<CapturedArtifact['envelope']>

let cachedEnvelope: EnvelopeShape | null = null

async function loadCapturedEnvelope(): Promise<EnvelopeShape> {
  if (cachedEnvelope) return cachedEnvelope
  const raw = await readFile(PROOF_PATH, 'utf8')
  const artifact = JSON.parse(raw) as CapturedArtifact
  if (!artifact.envelope) {
    throw new Error('captured artifact has no envelope')
  }
  cachedEnvelope = artifact.envelope
  return cachedEnvelope
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Random delay inside the requested 300-800ms band so terminal events arrive over
// ~1-3 seconds like a real incident unfolding instead of an instant batch dump.
function stepDelay(): number {
  return 300 + Math.floor(Math.random() * 500)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(errorMessage(err)))
      },
    )
  })
}

function extractPreviewResult(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const preview = (parsed as Record<string, unknown>).preview_result
  if (preview === undefined || preview === null) return undefined
  return preview
}

function extractRecords(previewResult: unknown): unknown[] {
  if (Array.isArray(previewResult)) return previewResult
  if (
    typeof previewResult === 'object' &&
    previewResult !== null &&
    Array.isArray((previewResult as Record<string, unknown>).records)
  ) {
    return (previewResult as { records: unknown[] }).records
  }
  return []
}

export default async function simulateRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SimulateDriftBody }>(
    '/simulate-drift',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            collectorKey: { type: 'string', minLength: 1 },
            collectorId: { type: 'string', minLength: 1 },
            key: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const ip = request.ip || '127.0.0.1'
      if (!checkRateLimit(ip)) {
        return reply.code(429).send({ error: 'rate_limited' })
      }

      const simulateKey = process.env.SIMULATE_KEY
      if (simulateKey) {
        const headerKey = request.headers['x-simulate-key']
        const bodyKey = request.body.key
        if (headerKey !== simulateKey && bodyKey !== simulateKey) {
          return reply.code(401).send({ error: 'unauthorized_simulate_key' })
        }
      }

      const { collectorKey, collectorId } = request.body

      let key = collectorKey
      if (!key && collectorId) {
        const match = COLLECTORS.find((c) => c.collectorId === collectorId)
        if (match) key = match.key
      }
      if (!key || !(key in MANDI_COLLECTORS)) {
        return reply.code(400).send({
          error: `Unknown collectorKey. Valid keys: ${Object.keys(MANDI_COLLECTORS).join(', ')}`,
        })
      }

      const definition = COLLECTORS.find((c) => c.key === key)
      if (!definition) {
        return reply.code(404).send({ error: `Collector "${key}" not found in registry` })
      }
      if (key !== 'mumbai_apmc') {
        return reply.code(400).send({
          error: `Simulation replay is only wired for mumbai_apmc (captured artifact is Mumbai-specific), got "${key}"`,
        })
      }
      if (!hasRealCollectorId(definition)) {
        return reply.code(400).send({ error: `Collector "${key}" has no activated collectorId` })
      }

      await prisma.collector.upsert({
        where: { id: definition.collectorId },
        update: {},
        create: {
          id: definition.collectorId,
          name: definition.name,
          portalUrl: definition.sourceUrl,
          lastGoodSelectors: Object.fromEntries(
            definition.expectedFields.map((field) => [field, `.${field}`]),
          ),
        },
      })

      // Step 1: drift detected
      eventBus.publish('drift.simulated', {
        collectorId: definition.collectorId,
        kind: SIMULATED_DRIFT_KIND,
        simulated: true,
      })
      console.log(
        `[simulate-drift] simulated drift (${SIMULATED_DRIFT_KIND}) on ${definition.collectorId}`,
      )
      await sleep(stepDelay())

      // Step 2: real Incident row (DETECTED) + incident.simulated with diagnosis text
      const diagnosis = buildStaleArchiveHealDiagnosis({ sourceUrl: definition.sourceUrl })
      const incident = await prisma.incident.create({
        data: {
          collectorId: definition.collectorId,
          type: 'SCHEMA_DRIFT',
          field: 'report_date',
          symptom:
            '[SIMULATED] rows carry the stale archive date 2026-08-03 instead of the current date',
          affectedRatio: 1,
          status: 'DETECTED',
          simulated: true,
        },
      })
      eventBus.publish('incident.simulated', {
        incidentId: incident.id,
        collectorId: definition.collectorId,
        diagnosis,
        simulated: true,
      })
      await sleep(stepDelay())

      // Step 3: HEALING
      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: 'HEALING' },
      })
      eventBus.publish('heal.started', {
        incidentId: incident.id,
        collectorId: definition.collectorId,
        type: incident.type,
        simulated: true,
      })
      await sleep(stepDelay())

      eventBus.publish('heal.cli.started', {
        incidentId: incident.id,
        collectorId: definition.collectorId,
        simulated: true,
      })
      await sleep(stepDelay())

      // Steps 4-5: real CLI heal only behind token+flag, else captured replay
      const liveCliEnabled =
        Boolean(process.env.BRIGHTDATA_API_TOKEN) &&
        process.env.SIMULATE_USE_REAL_CLI === 'true'

      let source: 'live-cli' | 'captured-replay' = 'captured-replay'
      let previewResult: unknown | undefined
      let liveFailureReason = ''

      if (liveCliEnabled) {
        try {
          const result = await withTimeout(
            runBdataHeal(definition.collectorId, diagnosis, {
              timeoutSeconds: LIVE_CLI_TIMEOUT_SECONDS,
            }),
            LIVE_CLI_TIMEOUT_MS,
          )
          const preview = extractPreviewResult(result.parsed)
          if (!preview) throw new Error('live CLI result contained no preview_result')
          previewResult = preview
          source = 'live-cli'
          console.log('[simulate-drift] using LIVE CLI result')
        } catch (err) {
          liveFailureReason = errorMessage(err)
        }
      } else {
        liveFailureReason = 'BRIGHTDATA_API_TOKEN missing or SIMULATE_USE_REAL_CLI not "true"'
      }

      if (!previewResult) {
        try {
          const captured = await loadCapturedEnvelope()
          const preview = extractPreviewResult(captured)
          if (!preview) throw new Error('captured artifact has no preview_result')
          previewResult = preview
        } catch (err) {
          const message = errorMessage(err)
          console.error(`[simulate-drift] no preview available at all: ${message}`)

          eventBus.publish('heal.cli.failed', {
            incidentId: incident.id,
            error: message,
            simulated: true,
          })
          await sleep(stepDelay())

          await prisma.incident.update({
            where: { id: incident.id },
            data: { status: 'ESCALATED' },
          })
          eventBus.publish('heal.escalated', {
            incidentId: incident.id,
            reason: 'no_preview_available',
            detail: `live call unavailable (${liveFailureReason}); replay artifact unusable: ${message}`,
            simulated: true,
          })
          return reply.code(409).send({
            simulated: true,
            incidentId: incident.id,
            outcome: 'ESCALATED',
            error:
              'No heal preview available: live CLI disabled/failed and seed-data/genuine-heal-mumbai.json is missing or unusable.',
          })
        }
        console.log(
          `[simulate-drift] using CAPTURED replay (no live key / flag off / live call failed: ${liveFailureReason})`,
        )
      }

      eventBus.publish('heal.cli.completed', {
        incidentId: incident.id,
        collectorId: definition.collectorId,
        output: JSON.stringify(previewResult),
        parsed: previewResult,
        simulated: true,
      })
      await sleep(stepDelay())

      // Step 6: GRADED — same grader as genuine heals, full GradeReport emitted
      const records = extractRecords(previewResult)
      const rows = records.flatMap((record) => expandRows(definition.key, record))
      const report: GenuineHealGradeReport = gradeGenuineHealPreview({ rows })

      const persistedGrade = await prisma.grade.create({
        data: {
          incidentId: incident.id,
          score: report.score,
          checks: report.checks as object,
          reason: report.approved
            ? `Grade passed: score ${report.score} >= ${report.threshold} threshold`
            : `Grade failed: score ${report.score} below ${GENUINE_HEAL_THRESHOLD} threshold${
                report.hardGateFailed ? ` (hard gate failed: ${report.hardGateFailed})` : ''
              }`,
        },
      })
      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: 'GRADED' },
      })
      eventBus.publish('heal.graded', {
        incidentId: incident.id,
        gradeId: persistedGrade.id,
        score: report.score,
        threshold: report.threshold,
        approved: report.approved,
        hardGateFailed: report.hardGateFailed,
        checks: report.checks,
        simulated: true,
      })
      await sleep(stepDelay())

      // Step 7: branch per the state machine — simulated incidents skip the real
      // bdata approve call (the collector was already approved once; re-approving
      // against the same collector during a replay is meaningless).
      if (report.approved) {
        await prisma.incident.update({
          where: { id: incident.id },
          data: { status: 'RECOVERED' },
        })
        eventBus.publish('heal.recovered', {
          incidentId: incident.id,
          collectorId: definition.collectorId,
          grade: { score: report.score, threshold: report.threshold },
          approvedAt: new Date().toISOString(),
          approvalSkipped: 'simulated - CLI approve not re-invoked',
          simulated: true,
        })
        return reply.code(200).send({
          simulated: true,
          incidentId: incident.id,
          outcome: 'APPROVED',
          gradeScore: report.score,
          source,
        })
      }

      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: 'ESCALATED' },
      })
      eventBus.publish('heal.escalated', {
        incidentId: incident.id,
        gradeId: persistedGrade.id,
        score: report.score,
        reason: 'grade_failed',
        report,
        simulated: true,
      })
      return reply.code(200).send({
        simulated: true,
        incidentId: incident.id,
        outcome: 'ESCALATED',
        gradeScore: report.score,
        source,
      })
    },
  )
}
