import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const DISCOVERED_PATH = path.join(BACKEND_ROOT, 'src', 'collectors', 'discovered-collectors.json')
const SEED_DATA_DIR = path.join(BACKEND_ROOT, 'seed-data')
const OUTPUT_PATH = path.join(SEED_DATA_DIR, 'azadpur-smoke-test.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

async function main(): Promise<void> {
  const discContent = await readFile(DISCOVERED_PATH, 'utf8')
  const discovered = JSON.parse(discContent) as Record<string, { collectorId: string; sourceUrl: string }>
  const azadpur = discovered.azadpur_apmc

  if (!azadpur || !azadpur.collectorId) {
    throw new Error('azadpur_apmc not found in discovered-collectors.json')
  }

  const { collectorId, sourceUrl } = azadpur
  console.log(`[smoke-test-azadpur] running collector ${collectorId} for ${sourceUrl}`)

  const { runCollector } = await import('../src/brightdata/cli.js')
  const result = await runCollector(collectorId, sourceUrl, { timeoutSeconds: 1800 })

  if (!result.ok || !result.data) {
    console.error('[smoke-test-azadpur] FAILED')
    console.error(`[smoke-test-azadpur] error: ${result.error ?? 'unknown error'}`)
    console.error(`[smoke-test-azadpur] raw log: ${result.logPath}`)
    process.exitCode = 1
    return
  }

  const records = result.data.records
  // Print pretty JSON to console
  console.log(JSON.stringify(records, null, 2))

  // Save to packages/backend/seed-data/azadpur-smoke-test.json
  await mkdir(SEED_DATA_DIR, { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(records, null, 2), 'utf8')

  // Print summary
  let rows: unknown[] = []
  if (Array.isArray(records)) {
    rows = records
  } else if (records && typeof records === 'object') {
    const recs = (records as Record<string, unknown>).records
    if (Array.isArray(recs)) {
      rows = recs
    }
  }

  console.log('==================================================')
  console.log('[smoke-test-azadpur] RUN COMPLETED')
  console.log(`[smoke-test-azadpur] Row count: ${rows.length}`)
  if (rows.length > 0) {
    const firstRow = rows[0]
    const fields = typeof firstRow === 'object' && firstRow !== null ? Object.keys(firstRow) : []
    console.log(`[smoke-test-azadpur] Fields on first row: ${JSON.stringify(fields)}`)
  } else {
    console.log('[smoke-test-azadpur] No rows returned')
  }
  console.log(`[smoke-test-azadpur] Saved to: ${OUTPUT_PATH}`)
  console.log('==================================================')
}

main().catch((err: unknown) => {
  console.error('[smoke-test-azadpur] UNEXPECTED ERROR:', err)
  process.exitCode = 1
})
