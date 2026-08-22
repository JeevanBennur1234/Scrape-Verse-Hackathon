import type { Incident } from '@prisma/client'

import { prisma } from '../db.js'
import { checkForSchemaDrift, createIncidentIfAbsent } from './validator.js'

export interface DetectionInput {
  collectorId: string
  records: unknown[]
  expectedFields: string[]
}

export interface PriceOutlierInput {
  collectorId: string
  record: unknown
}

export interface PriceOutlierOptions {
  windowDays?: number
  threshold?: number
}

export { checkForSchemaDrift as detectSchemaDrift }

export async function detectNullSpike(
  input: DetectionInput,
  threshold = 0.25,
): Promise<Incident | null> {
  const { collectorId, records, expectedFields } = input
  if (records.length === 0 || expectedFields.length === 0) return null

  const nullCounts = new Map<string, number>()
  let totalCells = 0
  let nullCells = 0

  for (const record of records) {
    if (typeof record !== 'object' || record === null) {
      for (const field of expectedFields) {
        nullCounts.set(field, (nullCounts.get(field) ?? 0) + 1)
      }
      nullCells += expectedFields.length
      totalCells += expectedFields.length
      continue
    }

    const value = record as Record<string, unknown>
    for (const field of expectedFields) {
      totalCells += 1
      if (value[field] === null || value[field] === undefined) {
        nullCells += 1
        nullCounts.set(field, (nullCounts.get(field) ?? 0) + 1)
      }
    }
  }

  const nullRate = nullCells / totalCells
  if (nullRate <= threshold) return null

  const field = [...nullCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? expectedFields[0]!
  const symptom = `Null rate ${(nullRate * 100).toFixed(1)}% exceeds ${(threshold * 100).toFixed(0)}% threshold (${nullCells}/${totalCells} cells null)`

  return createIncidentIfAbsent({
    collectorId,
    type: 'NULL_SPIKE',
    field,
    symptom,
    affectedRatio: nullRate,
  })
}

export async function detectPriceOutlier(
  input: PriceOutlierInput,
  options: PriceOutlierOptions = {},
): Promise<Incident | null> {
  const { collectorId, record } = input
  const windowDays = options.windowDays ?? 7
  const threshold = options.threshold ?? 0.6

  if (typeof record !== 'object' || record === null) return null
  const value = record as Record<string, unknown>
  const commodity = typeof value.commodity === 'string' ? value.commodity : undefined
  const market = typeof value.market === 'string' ? value.market : undefined
  const modalPrice =
    typeof value.modalPrice === 'number' && Number.isFinite(value.modalPrice)
      ? value.modalPrice
      : undefined
  if (!commodity || !market || modalPrice === undefined) return null

  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const ticks = await prisma.priceTick.findMany({
    where: { collectorId, commodity, market, recordedAt: { gte: windowStart } },
    select: { modalPrice: true },
  })
  if (ticks.length === 0) return null

  const baseline = median(ticks.map((tick) => tick.modalPrice))
  if (!Number.isFinite(baseline) || baseline <= 0) return null

  const delta = Math.abs(modalPrice - baseline) / baseline
  if (delta <= threshold) return null

  const symptom = `modalPrice ${modalPrice} deviates ${(delta * 100).toFixed(1)}% from ${windowDays}-day rolling median ${baseline}`

  return createIncidentIfAbsent({
    collectorId,
    type: 'PRICE_OUTLIER',
    field: 'modalPrice',
    symptom,
    affectedRatio: Math.min(delta, 1),
  })
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}
