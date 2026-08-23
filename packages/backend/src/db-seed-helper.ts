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
    const seededCollectorIds = new Set<string>()

    for (const collector of seed.collectors) {
      if (collector.portalUrl?.includes('example.in') || collector.id === 'c_mt2mhs6s2i4ww8hntx') {
        continue
      }
      let id = collector.id
      let status = collector.status
      if (id === 'PENDING') {
        id = 'c_msamb_pending'
        status = 'PENDING_SETUP'
      }

      await prisma.collector.upsert({
        where: { id },
        update: { name: collector.name, portalUrl: collector.portalUrl, status },
        create: {
          id,
          name: collector.name,
          portalUrl: collector.portalUrl,
          state: collector.state ?? 'IDLE',
          status: status ?? 'HEALTHY',
          lastGoodSelectors: collector.lastGoodSelectors ?? {},
          ...(collector.createdAt ? { createdAt: new Date(collector.createdAt) } : {}),
        },
      })
      seededCollectorIds.add(id)
      collectorsDone += 1
    }

    let ticksDone = 0
    const filteredTicks = seed.priceTicks.filter((tick: any) => {
      let cid = tick.collectorId
      if (cid === 'PENDING') cid = 'c_msamb_pending'
      return seededCollectorIds.has(cid)
    })

    for (const part of chunk(filteredTicks, CHUNK_SIZE)) {
      const result = await prisma.priceTick.createMany({
        data: part.map((tick: any) => {
          let cid = tick.collectorId
          if (cid === 'PENDING') cid = 'c_msamb_pending'
          return {
            id: tick.id,
            collectorId: cid,
            commodity: tick.commodity,
            market: tick.market,
            modalPrice: tick.modalPrice,
            minPrice: tick.minPrice,
            maxPrice: tick.maxPrice,
            arrivalQty: tick.arrivalQty,
            recordedAt: new Date(tick.recordedAt),
          }
        }),
      })
      ticksDone += result.count
    }

    let incidentsDone = 0
    let gradesDone = 0
    const filteredIncidents = seed.incidents.filter((inc: any) => {
      let cid = inc.collectorId
      if (cid === 'PENDING') cid = 'c_msamb_pending'
      return seededCollectorIds.has(cid)
    })

    for (const incident of filteredIncidents) {
      let cid = incident.collectorId
      if (cid === 'PENDING') cid = 'c_msamb_pending'

      await prisma.incident.upsert({
        where: { id: incident.id },
        update: { status: incident.status, symptom: incident.symptom },
        create: {
          id: incident.id,
          collectorId: cid,
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
