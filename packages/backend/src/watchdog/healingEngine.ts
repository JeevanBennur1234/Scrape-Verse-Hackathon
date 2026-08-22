import type { Collector, Incident } from '@prisma/client'

import { approveHeal, runBdataHeal } from '../brightdata/cli.js'
import { COLLECTORS } from '../collectors/mandi-registry.js'
import { prisma } from '../db.js'
import { eventBus } from '../events/pubsub.js'
import { gradeGenuineHealPreview, gradeRepair, type RepairGrade, type RepairPreview } from '../grader/repairGrader.js'
import { expandRows } from './fieldMapper.js'

export const HEAL_EVENT = {
  started: 'heal.started',
  diagnosis: 'heal.diagnosis',
  cliStarted: 'heal.cli.started',
  cliCompleted: 'heal.cli.completed',
  cliFailed: 'heal.cli.failed',
  repairParsed: 'heal.repair.parsed',
  repairGraded: 'heal.repair.graded',
  approved: 'heal.approved',
  recovered: 'heal.recovered',
  escalated: 'heal.escalated',
  failed: 'heal.failed',
} as const

export type HealOutcome = 'APPROVED' | 'ESCALATED'

export interface ApproveOverrideResult {
  ok: boolean
  error?: string
}

export interface HealingOverrides {
  runHeal?: typeof runBdataHeal
  grade?: typeof gradeRepair
  approve?: (collectorId: string, url?: string) => Promise<ApproveOverrideResult>
}

export interface HealingOverrides {
  runHeal?: typeof runBdataHeal
  grade?: typeof gradeRepair
}

const HEALABLE_TYPES: readonly string[] = ['SCHEMA_DRIFT', 'NULL_SPIKE']

export interface HealResult {
  incident: Incident
  grade: {
    id: string
    score: number
    reason: string
  } | null
  outcome: 'APPROVED' | 'ESCALATED'
}

export const STALE_ARCHIVE_DEFAULT_DATE = '2026-08-03'

export interface StaleArchiveDiagnosisOptions {
  staleDate?: string
  sourceUrl?: string
}

export function buildStaleArchiveHealDiagnosis(
  options: StaleArchiveDiagnosisOptions = {},
): string {
  const staleDate = options.staleDate ?? STALE_ARCHIVE_DEFAULT_DATE
  const core =
    `The collector is extracting data from a fixed archived date ` +
    `(view-daily-bajarbhav/veg/${staleDate}) instead of always resolving to today's current date ` +
    `on the daily-bajarbhav-dates/veg listing. The extraction logic should navigate to the current ` +
    `date's page dynamically, not a hardcoded archive URL.`
  if (!options.sourceUrl) return core
  return `${core}\n\nPortal source URL that must be resolved dynamically: ${options.sourceUrl}`
}

export async function healIncident(
  incidentId: string,
  overrides: HealingOverrides = {},
): Promise<HealResult | null> {
  const runHeal = overrides.runHeal ?? runBdataHeal

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { collector: true },
  })
  if (!incident) return null
  if (!isHealable(incident.type)) return null
  if (incident.status === 'RECOVERED' || incident.status === 'ESCALATED') return null

  const expectedFields = resolveExpectedFields(incident.collector)
  if (expectedFields.length === 0) {
    return await escalate(incident.id, 'No expected fields available to grade the repair')
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'HEALING' },
  })
  eventBus.publish(HEAL_EVENT.started, {
    incidentId: incident.id,
    collectorId: incident.collectorId,
    type: incident.type,
  })

  const prompt = buildDiagnosticPrompt(incident, incident.collector, expectedFields)
  eventBus.publish(HEAL_EVENT.diagnosis, { incidentId: incident.id, prompt })

  let output: string
  let parsed: unknown
  try {
    eventBus.publish(HEAL_EVENT.cliStarted, {
      incidentId: incident.id,
      collectorId: incident.collectorId,
    })
    const result = await runHeal(incident.collectorId, prompt)
    output = result.output
    parsed = result.parsed
    eventBus.publish(HEAL_EVENT.cliCompleted, {
      incidentId: incident.id,
      output,
      parsed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return await escalate(incident.id, `CLI heal failed: ${message}`)
  }

  const preview = parseRepairPreview(parsed)
  eventBus.publish(HEAL_EVENT.repairParsed, { incidentId: incident.id, preview })
  if (!preview) {
    return await escalate(incident.id, 'Could not parse repair preview from CLI output')
  }

  const baselineRowCount = await prisma.priceTick.count({
    where: {
      collectorId: incident.collectorId,
      recordedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  })

  const gradeResult = overrides.grade
    ? overrides.grade({ expectedFields, baselineRowCount, preview })
    : gradePreviewForCollector(incident.collectorId, preview, {
        expectedFields,
        baselineRowCount,
      })

  // Persist grade — status is transiently GRADED regardless of pass/fail
  const persisted = await prisma.grade.create({
    data: {
      incidentId: incident.id,
      score: gradeResult.score,
      checks: gradeResult.checks as object,
      reason: gradeResult.approved
        ? `Grade passed: score ${gradeResult.score} >= ${gradeResult.threshold} threshold — calling approve`
        : `Grade failed: score ${gradeResult.score} below ${gradeResult.threshold} threshold`,
    },
  })
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'GRADED' },
  })
  eventBus.publish(HEAL_EVENT.repairGraded, {
    incidentId: incident.id,
    score: gradeResult.score,
    approved: gradeResult.approved,
    checks: gradeResult.checks,
  })

  // Branch: grade failed → escalate immediately, do NOT call approve
  if (!gradeResult.approved) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'ESCALATED' },
    })
    eventBus.publish(HEAL_EVENT.escalated, {
      incidentId: incident.id,
      gradeId: persisted.id,
      score: gradeResult.score,
      reason: 'grade_failed',
    })
    return {
      incident: await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
      grade: persisted,
      outcome: 'ESCALATED',
    }
  }

  // Branch: grade passed → call bdata scraper approve
  eventBus.publish(HEAL_EVENT.approved, {
    incidentId: incident.id,
    collectorId: incident.collectorId,
    gradeId: persisted.id,
    score: gradeResult.score,
  })
  const doApprove =
    overrides.approve ??
    (async (cid: string, url?: string) => {
      const result = await approveHeal(cid, { url })
      return { ok: result.ok, error: result.error }
    })
  const collectorDef = COLLECTORS.find((c) => c.collectorId === incident.collectorId)
  let approveResult: ApproveOverrideResult
  try {
    approveResult = await doApprove(incident.collectorId, collectorDef?.sourceUrl)
  } catch (err) {
    approveResult = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!approveResult.ok) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: 'ESCALATED' },
    })
    eventBus.publish(HEAL_EVENT.escalated, {
      incidentId: incident.id,
      gradeId: persisted.id,
      score: gradeResult.score,
      reason: 'approve_call_failed',
      approveError: approveResult.error ?? 'unknown approve error',
    })
    return {
      incident: await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
      grade: persisted,
      outcome: 'ESCALATED',
    }
  }

  // Approve succeeded → RECOVERED
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'RECOVERED' },
  })
  eventBus.publish(HEAL_EVENT.recovered, {
    incidentId: incident.id,
    collectorId: incident.collectorId,
    grade: { score: gradeResult.score, threshold: gradeResult.threshold },
    approvedAt: new Date().toISOString(),
  })

  return {
    incident: await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } }),
    grade: persisted,
    outcome: 'APPROVED',
  }
}

async function escalate(incidentId: string, reason: string): Promise<HealResult> {
  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: 'ESCALATED' },
  })
  eventBus.publish(HEAL_EVENT.failed, { incidentId, reason })
  return {
    incident: await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } }),
    grade: null,
    outcome: 'ESCALATED',
  }
}

function isHealable(type: string): boolean {
  return HEALABLE_TYPES.includes(type)
}

function gradePreviewForCollector(
  collectorId: string,
  preview: RepairPreview,
  legacyInput: { expectedFields: string[]; baselineRowCount: number },
): RepairGrade {
  const definition = COLLECTORS.find((c) => c.collectorId === collectorId)
  if (!definition) {
    return gradeRepair({ ...legacyInput, preview })
  }

  const rawRows = preview.records.flatMap((record) => expandRows(definition.key, record))
  if (rawRows.length === 0) {
    return gradeRepair({ ...legacyInput, preview })
  }

  const report = gradeGenuineHealPreview({ rows: rawRows })
  const checksById = Object.fromEntries(
    report.checks.map((check) => [
      check.name,
      { passed: check.passed, score: check.passed ? 1 : 0, detail: check.details },
    ]),
  )
  return {
    score: report.score,
    approved: report.approved,
    threshold: report.threshold,
    checks: checksById as RepairGrade['checks'],
  }
}

function resolveExpectedFields(collector: Collector): string[] {
  const registered = COLLECTORS.find((c) => c.collectorId === collector.id)
  if (registered) return registered.expectedFields
  const selectors = collector.lastGoodSelectors
  if (typeof selectors === 'object' && selectors !== null) {
    return Object.keys(selectors as Record<string, unknown>)
  }
  return []
}

function buildDiagnosticPrompt(
  incident: Incident,
  collector: Collector,
  expectedFields: string[],
  staleDate: string = STALE_ARCHIVE_DEFAULT_DATE,
): string {
  return [
    buildStaleArchiveHealDiagnosis({ staleDate, sourceUrl: collector.portalUrl }),
    '',
    'You are repairing a Bright Data scraper collector after a detected anomaly.',
    `Collector: ${collector.name} (${collector.id})`,
    `Incident: ${incident.type} on field "${incident.field}"`,
    `Symptom: ${incident.symptom}`,
    `Affected ratio: ${incident.affectedRatio}`,
    `Expected fields: ${expectedFields.join(', ')}`,
    `Last known good selectors: ${JSON.stringify(collector.lastGoodSelectors)}`,
    '',
    'Produce a repair preview (JSON) with corrected records matching the expected fields so a grader can verify field presence, type validity, price bounds, and row-count stability.',
  ].join('\n')
}

function parseRepairPreview(parsed: unknown): RepairPreview | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const root = parsed as Record<string, unknown>
  const section = (root.preview ?? root.repair ?? root.result ?? root.preview_result) as
    Record<string, unknown> | undefined
  const records = Array.isArray(section?.records)
    ? section.records
    : Array.isArray(root.records)
      ? root.records
      : undefined
  if (!records) return null
  const rowCount = typeof section?.rowCount === 'number' ? section.rowCount : records.length
  return { records, rowCount }
}
