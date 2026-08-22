import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import dotenv from 'dotenv'

import { MANDI_COLLECTORS } from '../src/collectors/mandi-registry.js'
import { prisma } from '../src/db.js'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const OUTPUT_PATH = path.join(BACKEND_ROOT, 'seed-data', 'production-seed.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

const PRICE_TICK_LIMIT = 1000
const GENUINE_MUMBAI_COLLECTOR_ID = MANDI_COLLECTORS.mumbai_apmc.collectorId

async function main(): Promise<void> {
  console.log('[export] reading from DATABASE_URL...')

  const collectors = await prisma.collector.findMany({
    orderBy: { id: 'asc' },
  })

  const priceTicks = await prisma.priceTick.findMany({
    orderBy: { recordedAt: 'desc' },
    take: PRICE_TICK_LIMIT,
  })

  const incidents = await prisma.incident.findMany({
    where: { collectorId: GENUINE_MUMBAI_COLLECTOR_ID, simulated: false },
    include: { grades: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  const payload = {
    exportedAt: new Date().toISOString(),
    note:
      'Local snapshot for production seeding: all collectors, freshest price ticks ' +
      '(recordedAt desc), and genuine (non-simulated) Mumbai heal incidents with grades.',
    collectors,
    priceTicks,
    incidents,
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8')

  const gradeCount = incidents.reduce((sum, incident) => sum + incident.grades.length, 0)
  const newestTick = priceTicks[0]?.recordedAt ?? null
  const oldestTick = priceTicks[priceTicks.length - 1]?.recordedAt ?? null

  console.log(`[export] wrote ${OUTPUT_PATH}`)
  console.log(`[export] collectors exported:   ${collectors.length}`)
  console.log(
    `[export] priceTicks exported:   ${priceTicks.length}` +
      (newestTick && oldestTick ? ` (${newestTick.toISOString()} .. ${oldestTick.toISOString()})` : ''),
  )
  console.log(`[export] genuine incidents:     ${incidents.length} (grades: ${gradeCount})`)
}

main()
  .catch((err: unknown) => {
    console.error('[export] failed:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
