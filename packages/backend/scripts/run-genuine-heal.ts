import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const SEED_DATA_DIR = path.join(BACKEND_ROOT, 'seed-data')
const PROOF_PATH = path.join(SEED_DATA_DIR, 'genuine-heal-mumbai.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

interface MainModule {
  healCollector: (
    collectorId: string,
    diagnosis: string,
    options?: { url?: string; timeoutSeconds?: number },
  ) => Promise<{
    ok: boolean
    data?: { envelope: unknown }
    error?: string
    logPath: string
  }>
}

async function main(): Promise<void> {
  if (!process.env.BRIGHTDATA_API_KEY && !process.env.BRIGHTDATA_API_TOKEN) {
    console.error('[genuine-heal] FAIL: no BRIGHTDATA_API_TOKEN in environment.')
    process.exitCode = 1
    return
  }

  const registry = await import('../src/collectors/mandi-registry.js')
  const mumbai = registry.MANDI_COLLECTORS.mumbai_apmc

  if (!registry.hasRealCollectorId({ ...mumbai, key: 'mumbai_apmc' })) {
    console.error('[genuine-heal] mumbai_apmc collectorId is not activated in mandi-registry.ts')
    process.exitCode = 1
    return
  }

  const { buildStaleArchiveHealDiagnosis } = await import(
    '../src/watchdog/healingEngine.js'
  )
  const diagnosis = buildStaleArchiveHealDiagnosis({
    staleDate: '2026-08-03',
    sourceUrl: mumbai.sourceUrl,
  })

  console.log('==================================================')
  console.log(`[genuine-heal] collector : ${mumbai.collectorId}`)
  console.log(`[genuine-heal] source    : ${mumbai.sourceUrl}`)
  console.log('[genuine-heal] diagnosis :')
  console.log(diagnosis)
  console.log('==================================================')
  console.log('[genuine-heal] calling bdata scraper heal (5-20 min; output goes to log file)...')

  const cli = (await import('../src/brightdata/cli.js')) as unknown as MainModule
  const result = await cli.healCollector(mumbai.collectorId, diagnosis, {
    url: mumbai.sourceUrl,
    timeoutSeconds: 1800,
  })

  await mkdir(SEED_DATA_DIR, { recursive: true })

  const proofArtifact = {
    collectorId: mumbai.collectorId,
    name: mumbai.name,
    sourceUrl: mumbai.sourceUrl,
    diagnosis,
    capturedAt: new Date().toISOString(),
    ok: result.ok,
    error: result.error ?? null,
    cliLogPath: result.logPath,
    envelope: result.data?.envelope ?? null,
  }

  await writeFile(PROOF_PATH, `${JSON.stringify(proofArtifact, null, 2)}\n`, 'utf8')

  if (!result.ok || !result.data) {
    console.error('==================================================')
    console.error('[genuine-heal] HEAL CALL FAILED')
    console.error(`[genuine-heal] error: ${result.error ?? 'unknown'}`)
    console.error(`[genuine-heal] raw log: ${result.logPath}`)
    console.error(`[genuine-heal] partial state saved to: ${PROOF_PATH}`)
    console.error('[genuine-heal] NOT retrying (retries burn credits).')
    console.error('==================================================')
    process.exitCode = 1
    return
  }

  const envelope = (result.data.envelope ?? {}) as {
    status?: string
    diff_summary?: string
    preview_result?: unknown
    next_step?: string
  }

  console.log('')
  console.log('================ HEAL PROPOSAL CAPTURED ================')
  console.log(`status      : ${envelope.status ?? '(none)'}`)
  console.log(`next_step   : ${envelope.next_step ?? '(none)'}`)
  console.log(`cli log     : ${result.logPath}`)
  console.log(`proof file  : ${PROOF_PATH}`)
  console.log('')
  console.log('---------------- diff_summary ----------------')
  console.log(envelope.diff_summary ?? '(no diff_summary returned)')
  console.log('')
  console.log('---------------- preview_result ----------------')
  console.log(JSON.stringify(envelope.preview_result, null, 2))
  console.log('========================================================')
  console.log('')
  console.log(
    '[genuine-heal] NOT auto-approving. Review the above, then run manually:',
  )
  console.log(
    `  npx -p @brightdata/cli bdata scraper approve ${mumbai.collectorId} --url ${mumbai.sourceUrl}`,
  )
}

void main().catch((err: unknown) => {
  console.error('[genuine-heal] UNEXPECTED ERROR:', err instanceof Error ? err.stack : String(err))
  process.exitCode = 1
})
