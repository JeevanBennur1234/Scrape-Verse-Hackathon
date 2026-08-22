import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

interface MainModule {
  runOnceForCollector: (collector: unknown) => Promise<unknown>
  COLLECTORS: Array<{ key: string; collectorId: string; name: string }>
  prisma: { $disconnect: () => Promise<void> }
}

async function main(): Promise<void> {
  const key = process.argv[2]
  const snapshotFlagIndex = process.argv.indexOf('--from-snapshot')
  const snapshotPath =
    snapshotFlagIndex !== -1 ? process.argv[snapshotFlagIndex + 1] : undefined

  if (!key) {
    console.error('[run-once] usage: tsx scripts/run-once.ts <collectorKey> [--from-snapshot <file.json>]')
    console.error(
      `[run-once] available keys: ${Object.keys(await import('../src/collectors/mandi-registry.js')).join(', ')}`,
    )
    process.exitCode = 1
    return
  }

  const registry = await import('../src/collectors/mandi-registry.js')
  const config = registry.MANDI_COLLECTORS[key as keyof typeof registry.MANDI_COLLECTORS]
  if (!config) {
    console.error(`[run-once] unknown collector key "${key}"`)
    console.error(`[run-once] available keys: ${Object.keys(registry.MANDI_COLLECTORS).join(', ')}`)
    process.exitCode = 1
    return
  }
  if (!registry.hasRealCollectorId({ ...config, key })) {
    console.error(
      `[run-once] collector "${key}" has no real collectorId yet (${config.collectorId}). Run scripts/create-msamb-collector.ts first.`,
    )
    process.exitCode = 1
    return
  }

  const definition = registry.COLLECTORS.find((c) => c.key === key)
  if (!definition) {
    console.error(`[run-once] definition for "${key}" not found in COLLECTORS`)
    process.exitCode = 1
    return
  }

  console.log(`[run-once] running pipeline once for "${key}" (${definition.collectorId})`)
  if (snapshotPath) {
    console.log(`[run-once] REPLAY MODE: reading records from ${snapshotPath} (no API call)`)
  } else {
    console.log(`[run-once] source: ${definition.sourceUrl}`)
  }

  const scheduler = (await import('../src/watchdog/scheduler.js')) as unknown as MainModule
  const result = (await scheduler.runOnceForCollector(definition, {
    snapshotFile: snapshotPath,
  })) as {
    fetchedRecords: number
    insertedRows: Array<Record<string, unknown>>
    duplicateRows: number
    failedRows: number
  }

  console.log('')
  console.log('================ RUN SUMMARY ================')
  console.log(`[run-once] fetched records : ${result.fetchedRecords}`)
  console.log(`[run-once] inserted rows   : ${result.insertedRows.length}`)
  console.log(`[run-once] duplicates      : ${result.duplicateRows}`)
  console.log(`[run-once] failed rows     : ${result.failedRows}`)
  console.log('')

  if (result.insertedRows.length > 0) {
    console.log('================ INSERTED PRICE TICKS ================')
    for (const row of result.insertedRows) {
      console.log(
        [
          row.commodity,
          `market=${row.market}`,
          `min=${row.minPrice}`,
          `modal=${row.modalPrice}`,
          `max=${row.maxPrice}`,
          `qty=${row.arrivalQty}`,
          `recordedAt=${row.recordedAt instanceof Date ? row.recordedAt.toISOString() : String(row.recordedAt)}`,
        ].join(' | '),
      )
    }
    console.log('')
    console.log('[run-once] verifying rows exist in Postgres...')
    const { prisma } = await import('../src/db.js')
    const ids = result.insertedRows.map((row) => String(row.id))
    const persisted = await prisma.priceTick.findMany({
      where: { id: { in: ids } },
      orderBy: { recordedAt: 'desc' },
    })
    console.log(`[run-once] Postgres confirms ${persisted.length}/${ids.length} rows present`)
    await prisma.$disconnect()
  } else {
    console.log('[run-once] no new rows inserted (all duplicates or all failed)')
  }
}

void main().catch((err: unknown) => {
  console.error('[run-once] FAILED:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
