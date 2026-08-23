/* eslint-disable @typescript-eslint/no-explicit-any */
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
      let id = collector.id
      if (id === 'PENDING') {
        id = 'c_msamb_pending'
      }

      // Filter out non-compliant/government collectors to align with hackathon compliance
      if (id !== 'c_mt364sxr1jxad1qpuy') {
        continue
      }

      await prisma.collector.upsert({
        where: { id },
        update: { name: collector.name, portalUrl: collector.portalUrl, status: collector.status },
        create: {
          id,
          name: collector.name,
          portalUrl: collector.portalUrl,
          state: collector.state ?? 'IDLE',
          status: collector.status ?? 'HEALTHY',
          lastGoodSelectors: collector.lastGoodSelectors ?? {},
          ...(collector.createdAt ? { createdAt: new Date(collector.createdAt) } : {}),
        },
      })
      seededCollectorIds.add(id)
      collectorsDone += 1
    }

    // Dynamic date offset calculation to make seeded data look fresh relative to "now"
    const seedDates = seed.priceTicks.map((t: any) => new Date(t.recordedAt).getTime())
    const maxSeedDate = seedDates.length > 0 ? Math.max(...seedDates) : Date.now()
    const offsetMs = Date.now() - maxSeedDate

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
          const originalDate = new Date(tick.recordedAt)
          const shiftedDate = new Date(originalDate.getTime() + offsetMs)
          return {
            id: tick.id,
            collectorId: cid,
            commodity: tick.commodity,
            market: tick.market,
            modalPrice: tick.modalPrice,
            minPrice: tick.minPrice,
            maxPrice: tick.maxPrice,
            arrivalQty: tick.arrivalQty,
            recordedAt: shiftedDate,
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

      const incidentOriginalDate = new Date(incident.createdAt)
      const incidentShiftedDate = new Date(incidentOriginalDate.getTime() + offsetMs)

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
          createdAt: incidentShiftedDate,
        },
      })
      incidentsDone += 1

      for (const grade of incident.grades) {
        const gradeOriginalDate = new Date(grade.createdAt)
        const gradeShiftedDate = new Date(gradeOriginalDate.getTime() + offsetMs)

        await prisma.grade.upsert({
          where: { id: grade.id },
          update: {},
          create: {
            id: grade.id,
            incidentId: grade.incidentId,
            score: grade.score,
            checks: grade.checks,
            reason: grade.reason,
            createdAt: gradeShiftedDate,
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

export async function refreshExistingDataTimestamps(): Promise<void> {
  try {
    const ticks = await prisma.priceTick.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 1,
    })
    const firstTick = ticks[0]
    if (!firstTick) return

    const latestTickDate = new Date(firstTick.recordedAt).getTime()
    const offsetMs = Date.now() - latestTickDate

    // If the latest tick in the DB is older than 6 hours, shift all dates forward to keep the demo fresh
    if (offsetMs > 6 * 60 * 60 * 1000) {
      const offsetSeconds = Math.round(offsetMs / 1000)
      console.log(`[db-seed-helper] Data is stale. Shifting SQLite database timestamps forward by ${Math.round(offsetMs / (1000 * 60 * 60))} hours for fresh demo metrics...`)
      
      await prisma.$executeRawUnsafe(
        `UPDATE PriceTick SET recordedAt = datetime(strftime('%s', recordedAt) + ${offsetSeconds}, 'unixepoch')`
      )
      await prisma.$executeRawUnsafe(
        `UPDATE Incident SET createdAt = datetime(strftime('%s', createdAt) + ${offsetSeconds}, 'unixepoch')`
      )
      await prisma.$executeRawUnsafe(
        `UPDATE Grade SET createdAt = datetime(strftime('%s', createdAt) + ${offsetSeconds}, 'unixepoch')`
      )
      console.log(`[db-seed-helper] Successfully refreshed database timestamps.`)
    }
  } catch (error) {
    console.error(`[db-seed-helper] Failed to refresh timestamps:`, error)
  }
}
