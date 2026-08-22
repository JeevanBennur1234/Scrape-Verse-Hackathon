import type { Incident, IncidentType } from '@prisma/client'

import { prisma } from '../db.js'

export interface ValidationResult {
  ok: boolean
  missingFields: string[]
  nullFields: string[]
  record?: unknown
}

export interface SchemaDriftInput {
  collectorId: string
  records: unknown[]
  expectedFields: string[]
}

export interface IncidentInput {
  collectorId: string
  type: IncidentType
  field: string
  symptom: string
  affectedRatio: number
}

export function validateRecord(record: unknown, expectedFields: string[]): ValidationResult {
  if (typeof record !== 'object' || record === null) {
    return { ok: false, missingFields: [...expectedFields], nullFields: [] }
  }

  const value = record as Record<string, unknown>
  const missingFields = expectedFields.filter((field) => !(field in value))
  const nullFields = expectedFields.filter(
    (field) => field in value && (value[field] === null || value[field] === undefined),
  )
  const ok = missingFields.length === 0 && nullFields.length === 0

  return ok ? { ok, missingFields, nullFields } : { ok, missingFields, nullFields, record }
}

export async function checkForSchemaDrift(input: SchemaDriftInput): Promise<Incident | null> {
  const { collectorId, records, expectedFields } = input
  if (records.length === 0) return null

  const missingCounts = new Map<string, number>()
  let affectedRecords = 0

  for (const record of records) {
    const result = validateRecord(record, expectedFields)
    if (!result.ok) {
      affectedRecords += 1
    }
    for (const field of result.missingFields) {
      missingCounts.set(field, (missingCounts.get(field) ?? 0) + 1)
    }
  }

  if (missingCounts.size === 0) return null

  const field = mostAffectedField(missingCounts, expectedFields)
  const symptom = `Missing expected fields: ${[...missingCounts.keys()].join(', ')} (${affectedRecords}/${records.length} records affected)`

  return createIncidentIfAbsent({
    collectorId,
    type: 'SCHEMA_DRIFT',
    field,
    symptom,
    affectedRatio: affectedRecords / records.length,
  })
}

export async function createIncidentIfAbsent(input: IncidentInput): Promise<Incident | null> {
  const existing = await prisma.incident.findFirst({
    where: {
      collectorId: input.collectorId,
      type: input.type,
      field: input.field,
      status: { not: 'RECOVERED' },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) return null

  return prisma.incident.create({
    data: { ...input, status: 'DETECTED' },
  })
}

function mostAffectedField(counts: Map<string, number>, expectedFields: string[]): string {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? expectedFields[0]!
}
