import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import { Prisma } from '@prisma/client'

import { prisma } from '../src/db.js'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const SEED_PATH = path.join(BACKEND_ROOT, 'seed-data', 'production-seed.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

interface CollectorRow {
  id: string
  name: string
  portalUrl: string
  state?: string
  status?: string
  lastGoodSelectors: unknown
  createdAt?: string
}

interface PriceTickRow {
  id: string
  collectorId: string
  commodity: string
  market: string
  modalPrice: number
  minPrice: number
  maxPrice: number
  arrivalQty: number
  recordedAt: string
}

interface GradeRow {
  id: string
  incidentId: string
  score: number
  checks: unknown
  reason: string
  createdAt?: string
}

interface IncidentRow {
  id: string
  collectorId: string
  type: string
  field: string
  symptom: string
  affectedRatio: number
  status: string
  simulated?: boolean
  createdAt?: string
  grades: GradeRow[]
}

interface ProductionSeed {
  collectors: CollectorRow[]
  priceTicks: PriceTickRow[]
  incidents: IncidentRow[]
}

const CHUNK_SIZE = 200

function chunk<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

async function main(): Promise<void> {
  console.log(`[import] reading ${SEED_PATH}`)
  const raw = await readFile(SEED_PATH, 'utf8')
  const seed = JSON.parse(raw) as ProductionSeed

  let collectorsDone = 0
  for (const collector of seed.collectors) {
    await prisma.collector.upsert({
      where: { id: collector.id },
      update: { name: collector.name, portalUrl: collector.portalUrl },
      create: {
        id: collector.id,
        name: collector.name,
        portalUrl: collector.portalUrl,
        state: collector.state ?? 'IDLE',
        status: collector.status ?? 'HEALTHY',
        lastGoodSelectors: asJson(collector.lastGoodSelectors ?? {}),
        ...(collector.createdAt ? { createdAt: new Date(collector.createdAt) } : {}),
      },
    })
    collectorsDone += 1
  }

  let ticksDone = 0
  for (const part of chunk(seed.priceTicks, CHUNK_SIZE)) {
    const result = await prisma.priceTick.createMany({
      data: part.map((tick) => ({
        id: tick.id,
        collectorId: tick.collectorId,
        commodity: tick.commodity,
        market: tick.market,
        modalPrice: tick.modalPrice,
        minPrice: tick.minPrice,
        maxPrice: tick.maxPrice,
        arrivalQty: tick.arrivalQty,
        recordedAt: new Date(tick.recordedAt),
      })),
    })
    ticksDone += result.count
  }

  let incidentsDone = 0
  let gradesDone = 0
  for (const incident of seed.incidents) {
    await prisma.incident.upsert({
      where: { id: incident.id },
      update: { status: incident.status, symptom: incident.symptom },
      create: {
        id: incident.id,
        collectorId: incident.collectorId,
        type: incident.type as never,
        field: incident.field,
        symptom: incident.symptom,
        affectedRatio: incident.affectedRatio,
        status: incident.status as never,
        simulated: incident.simulated ?? false,
        ...(incident.createdAt ? { createdAt: new Date(incident.createdAt) } : {}),
      },
    })
    incidentsDone += 1

    for (const grade of incident.grades) {
      await prisma.grade.upsert({
        where: { id: grade.id },
        update: {},
        create: {
          id: grade.id,
          incidentId: grade.incidentId,
          score: grade.score,
          checks: asJson(grade.checks),
          reason: grade.reason,
          ...(grade.createdAt ? { createdAt: new Date(grade.createdAt) } : {}),
        },
      })
      gradesDone += 1
    }
  }

  console.log('[import] done')
  console.log(`[import] collectors upserted:   ${collectorsDone}`)
  console.log(`[import] priceTicks inserted:   ${ticksDone} of ${seed.priceTicks.length} (duplicates skipped)`)
  console.log(`[import] incidents upserted:    ${incidentsDone} (grades: ${gradesDone})`)
}

main()
  .catch((err: unknown) => {
    console.error('[import] failed:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
