import { schedule, type ScheduledTask } from 'node-cron'
import type { Incident, PriceTick } from '@prisma/client'

import { collectSnapshot } from '../brightdata/restClient.js'
import { partitionCollectors, hasRealCollectorId, COLLECTORS } from '../collectors/mandi-registry.js'
import type { CollectorDefinition } from '../collectors/mandi-registry.js'
import { prisma } from '../db.js'
import { normalize, expandRows } from './fieldMapper.js'
import { detectNullSpike, detectPriceOutlier, detectSchemaDrift } from './anomalyDetector.js'
import { validateRecord, type ValidationResult } from './validator.js'

const MAX_RESULTS_PER_COLLECTOR = 100

export interface RawCollectorResult {
  collectorId: string
  key: string
  name: string
  triggeredAt: Date
  fetchedRecords: number
  validation: ValidationResult[]
  insertedRows: PriceTick[]
  duplicateRows: number
  failedRows: number
  incidents: Incident[]
}

export interface WatchdogOptions {
  intervalMinutes?: number
  timezone?: string
  runOnStart?: boolean
}

export interface WatchdogLogger {
  info: (message: string) => void
  error: (message: string, error?: unknown) => void
}

export interface WatchdogHandle {
  stop: () => void
}

const resultsByCollector = new Map<string, RawCollectorResult[]>()

const defaultLogger: WatchdogLogger = {
  info: (message) => console.log(`[watchdog] ${message}`),
  error: (message, error) => console.error(`[watchdog] ${message}`, error ?? ''),
}

export function startWatchdog(
  options: WatchdogOptions = {},
  logger: WatchdogLogger = defaultLogger,
): WatchdogHandle {
  if (process.env.WATCHDOG_ENABLED !== 'true') {
    logger.info(
      'WATCHDOG_ENABLED is not "true" — watchdog disabled, no cron registered (deployed instances never auto-trigger Bright Data calls unless explicitly opted in)',
    )
    return { stop: () => {} }
  }

  const intervalMinutes = options.intervalMinutes ?? 5
  const timezone = options.timezone ?? 'UTC'
  const { active, pending } = partitionCollectors()

  const task: ScheduledTask = schedule(
    `*/${intervalMinutes} * * * *`,
    () => {
      void runWatchdog(logger)
    },
    { timezone },
  )

  logger.info(
    `watchdog scheduled every ${intervalMinutes} minute(s) for ${active.length} active collector(s)${
      pending.length > 0 ? ` (${pending.length} pending skipped: ${pending.map((c) => c.key).join(', ')})` : ''
    } in ${timezone}`,
  )

  if (options.runOnStart) {
    void runWatchdog(logger)
  }

  return { stop: () => task.stop() }
}

export async function runWatchdog(
  logger: WatchdogLogger = defaultLogger,
): Promise<RawCollectorResult[]> {
  const { active } = partitionCollectors()

  const outcomes = await Promise.allSettled(
    active.map(async (collector) => {
      const result = await runOnceForCollector(collector)
      storeResult(result)
      return result
    }),
  )

  const results: RawCollectorResult[] = []
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value)
    } else {
      logger.error(`collector run failed: ${String(outcome.reason)}`, outcome.reason)
    }
  }
  return results
}

export interface RunOnceOptions {
  snapshotFile?: string
}

export async function runOnceForCollector(
  collector: CollectorDefinition,
  options: RunOnceOptions = {},
): Promise<RawCollectorResult> {
  await ensureCollectorRow(collector)

  let pageRecords: unknown[]
  if (options.snapshotFile) {
    const { readFile } = await import('node:fs/promises')
    pageRecords = JSON.parse(
      await readFile(options.snapshotFile, 'utf8'),
    ) as unknown[]
    console.log(`[scheduler] loaded ${pageRecords.length} page record(s) from ${options.snapshotFile}`)
  } else {
    pageRecords = await collectSnapshot(collector.collectorId, collector.sourceUrl, {
      maxPollMs: 15 * 60 * 1000,
    })
  }
  const rawRecords = pageRecords.flatMap((page) => expandRows(collector.key, page))

  const validation: ValidationResult[] = []
  const insertedRows: PriceTick[] = []
  let duplicateRows = 0
  let failedRows = 0

  for (const rawRow of rawRecords) {
    const recordValidation = validateRecord(rawRow, collector.expectedFields)
    validation.push(recordValidation)

    let tick
    try {
      tick = normalize(collector.key, rawRow)
    } catch {
      failedRows += 1
      continue
    }

    const sanityCheck = checkTickSanity(tick)
    if (!sanityCheck.ok) {
      failedRows += 1
      continue
    }

    try {
      const existing = await prisma.priceTick.findFirst({
        where: {
          collectorId: collector.collectorId,
          commodity: tick.commodity,
          market: tick.market,
          recordedAt: tick.recordedAt,
        },
      })
      if (existing) {
        duplicateRows += 1
        continue
      }
      const created = await prisma.priceTick.create({
        data: {
          collectorId: collector.collectorId,
          commodity: tick.commodity,
          market: tick.market,
          modalPrice: tick.modalPrice,
          minPrice: tick.minPrice,
          maxPrice: tick.maxPrice,
          arrivalQty: tick.arrivalQty,
          recordedAt: tick.recordedAt,
        },
      })
      insertedRows.push(created)
    } catch {
      failedRows += 1
    }
  }

  const incidents = await detectIncidents(collector, rawRecords).catch(() => [] as Incident[])

  return {
    collectorId: collector.collectorId,
    key: collector.key,
    name: collector.name,
    triggeredAt: new Date(),
    fetchedRecords: rawRecords.length,
    validation,
    insertedRows,
    duplicateRows,
    failedRows,
    incidents,
  }
}

export async function ensureCollectorRow(collector: CollectorDefinition): Promise<void> {
  const isPending = !hasRealCollectorId(collector)
  await prisma.collector.upsert({
    where: { id: collector.collectorId },
    update: { name: collector.name, portalUrl: collector.sourceUrl },
    create: {
      id: collector.collectorId,
      name: collector.name,
      portalUrl: collector.sourceUrl,
      status: isPending ? 'PENDING_SETUP' : 'HEALTHY',
      lastGoodSelectors: Object.fromEntries(
        collector.expectedFields.map((field) => [field, `.${field}`]),
      ),
    },
  })
}

export async function ensureAllCollectorRows(): Promise<void> {
  for (const collector of COLLECTORS) {
    await ensureCollectorRow(collector)
  }
}

function checkTickSanity(tick: {
  minPrice: number
  modalPrice: number
  maxPrice: number
}): { ok: boolean; reason?: string } {
  if (
    tick.minPrice <= tick.modalPrice &&
    tick.modalPrice <= tick.maxPrice &&
    tick.minPrice > 0
  ) {
    return { ok: true }
  }
  return { ok: false, reason: 'prices violate 0 < min <= modal <= max' }
}

async function detectIncidents(
  collector: CollectorDefinition,
  records: unknown[],
): Promise<Incident[]> {
  const incidents: Incident[] = []
  const drift = await detectSchemaDrift({
    collectorId: collector.collectorId,
    records,
    expectedFields: collector.expectedFields,
  })
  if (drift) incidents.push(drift)

  const spike = await detectNullSpike({
    collectorId: collector.collectorId,
    records,
    expectedFields: collector.expectedFields,
  })
  if (spike) incidents.push(spike)

  for (const record of records) {
    const outlier = await detectPriceOutlier({ collectorId: collector.collectorId, record })
    if (outlier) incidents.push(outlier)
  }

  return incidents
}

function storeResult(result: RawCollectorResult): void {
  const existing = resultsByCollector.get(result.collectorId) ?? []
  existing.push(result)
  if (existing.length > MAX_RESULTS_PER_COLLECTOR) {
    existing.shift()
  }
  resultsByCollector.set(result.collectorId, existing)
}

export function getRawResults(collectorId?: string): RawCollectorResult[] {
  if (collectorId) {
    return resultsByCollector.get(collectorId) ?? []
  }
  return [...resultsByCollector.values()].flat()
}
