import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './db.js'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const SEED_PATH = path.join(BACKEND_ROOT, 'seed-data', 'production-seed.json')

const CHUNK_SIZE = 200

function chunk<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

export async function seedProductionDataIfEmpty(): Promise<void> {
  try {
    const tickCount = await prisma.priceTick.count()
    if (tickCount > 0) {
      console.log(`[db-seed-helper] Price ticks already exist in database (${tickCount} rows). Skipping auto-seed.`)
      return
    }

    console.log(`[db-seed-helper] Database is empty. Attempting auto-seed from ${SEED_PATH}...`)
    const raw = await readFile(SEED_PATH, 'utf8')
    const seed = JSON.parse(raw)

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
          lastGoodSelectors: collector.lastGoodSelectors ?? {},
          ...(collector.createdAt ? { createdAt: new Date(collector.createdAt) } : {}),
        },
      })
      collectorsDone += 1
    }

    let ticksDone = 0
    for (const part of chunk(seed.priceTicks, CHUNK_SIZE)) {
      const result = await prisma.priceTick.createMany({
        data: part.map((tick: any) => ({
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
        skipDuplicates: true,
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
          type: incident.type as any,
          field: incident.field,
          symptom: incident.symptom,
          affectedRatio: incident.affectedRatio,
          status: incident.status as any,
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
            checks: grade.checks,
            reason: grade.reason,
            ...(grade.createdAt ? { createdAt: new Date(grade.createdAt) } : {}),
          },
        })
        gradesDone += 1
      }
    }

    console.log(`[db-seed-helper] Auto-seed success: ${collectorsDone} collectors, ${ticksDone} ticks, ${incidentsDone} incidents (grades: ${gradesDone})`)
  } catch (error) {
    console.error(`[db-seed-helper] Auto-seed failed:`, error)
  }
}
