import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const LOGS_DIR = path.join(BACKEND_ROOT, 'logs')
const COMBINED_LOG_PATH = path.join(LOGS_DIR, 'create-msamb.log')
const DISCOVERED_PATH = path.join(BACKEND_ROOT, 'src', 'collectors', 'discovered-collectors.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

const MSAMB_URL = 'https://www.msamb.com/ApmcDetail/APMCPriceInformation'
const EXTRACTION_DESCRIPTION =
  'Extract the daily APMC market price table: commodity name, market/APMC name, minimum price, maximum price, average or modal price, and arrival quantity, for all rows currently shown on the page.'

interface DiscoveredCollector {
  collectorId: string
  sourceUrl: string
  createdAt: string
}

type DiscoveredRegistry = Record<string, DiscoveredCollector>

async function appendCombinedLog(sourceLogPath: string): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true })
  let content = ''
  try {
    content = await readFile(sourceLogPath, 'utf8')
  } catch {
    content = `(log file missing at ${sourceLogPath})\n`
  }
  const header = `\n===== run @ ${new Date().toISOString()} (raw log: ${sourceLogPath}) =====\n`
  await appendFile(COMBINED_LOG_PATH, header + content, 'utf8')
}

async function readExistingRegistry(): Promise<DiscoveredRegistry> {
  try {
    const content = await readFile(DISCOVERED_PATH, 'utf8')
    const parsed = JSON.parse(content) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as DiscoveredRegistry
    }
  } catch {
    // fall through to fresh registry
  }
  return {}
}

async function persistDiscovered(entryKey: string, entry: DiscoveredCollector): Promise<void> {
  const registry = await readExistingRegistry()
  registry[entryKey] = entry
  await mkdir(path.dirname(DISCOVERED_PATH), { recursive: true })
  await writeFile(DISCOVERED_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
}

async function main(): Promise<void> {
  if (!process.env.BRIGHTDATA_API_KEY && !process.env.BRIGHTDATA_API_TOKEN) {
    console.error('[create-msamb] FAIL: no BRIGHTDATA_API_TOKEN/BRIGHTDATA_API_KEY in environment.')
    console.error(`[create-msamb] Looked at: ${path.join(WORKSPACE_ROOT, '.env')} and ${path.join(BACKEND_ROOT, '.env')}`)
    process.exitCode = 1
    return
  }

  console.log(`[create-msamb] creating collector for ${MSAMB_URL}`)
  console.log('[create-msamb] this takes 5-30 minutes; poll lines go to logs/create-msamb-*.log')

  const { createCollector } = await import('../src/brightdata/cli.js')
  const result = await createCollector(MSAMB_URL, EXTRACTION_DESCRIPTION, {
    timeoutSeconds: 1800,
  })

  await appendCombinedLog(result.logPath)

  if (!result.ok || !result.data) {
    console.error('==================================================')
    console.error('[create-msamb] FAILED')
    console.error(`[create-msamb] error : ${result.error ?? 'unknown error'}`)
    console.error(`[create-msamb] raw log: ${result.logPath}`)
    console.error(`[create-msamb] combined log: ${COMBINED_LOG_PATH}`)
    console.error('[create-msamb] NOT retrying automatically (retries burn credits).')
    console.error('==================================================')
    process.exitCode = 1
    return
  }

  const { collectorId } = result.data
  const entry: DiscoveredCollector = {
    collectorId,
    sourceUrl: MSAMB_URL,
    createdAt: new Date().toISOString(),
  }

  try {
    await persistDiscovered('msamb', entry)
  } catch (err) {
    console.error(
      `[create-msamb] WARNING: collector created but could not update ${DISCOVERED_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  console.log('')
  console.log('==================================================')
  console.log(`[create-msamb] SUCCESS`)
  console.log(`[create-msamb] COLLECTOR_ID: ${collectorId}`)
  console.log(`[create-msamb] source URL : ${MSAMB_URL}`)
  console.log(`[create-msamb] full log   : ${COMBINED_LOG_PATH}`)
  console.log(`[create-msamb] recorded in: ${DISCOVERED_PATH}`)
  console.log('==================================================')
}

void main().catch((err: unknown) => {
  console.error('[create-msamb] UNEXPECTED ERROR:', err instanceof Error ? err.stack : String(err))
  process.exitCode = 1
})
