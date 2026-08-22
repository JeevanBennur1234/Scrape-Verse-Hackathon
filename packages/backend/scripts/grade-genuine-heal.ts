import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..')
const WORKSPACE_ROOT = path.resolve(BACKEND_ROOT, '..', '..')
const DEFAULT_PROOF_PATH = path.join(BACKEND_ROOT, 'seed-data', 'genuine-heal-mumbai.json')

dotenv.config({ path: path.join(WORKSPACE_ROOT, '.env') })
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') })

function extractRows(previewResult: unknown): unknown[] {
  if (Array.isArray(previewResult)) return previewResult
  if (typeof previewResult === 'object' && previewResult !== null) {
    const record = previewResult as Record<string, unknown>
    for (const key of ['records', 'rows', 'data', 'items', 'results']) {
      const candidate = record[key]
      if (Array.isArray(candidate)) return candidate
    }
  }
  return []
}

async function main(): Promise<void> {
  const proofPath = process.argv[2] ?? DEFAULT_PROOF_PATH

  let artifact: {
    collectorId?: string
    sourceUrl?: string
    diagnosis?: string
    capturedAt?: string
    envelope?: { preview_result?: unknown; status?: string; diff_summary?: string }
  }
  try {
    artifact = JSON.parse(await readFile(proofPath, 'utf8'))
  } catch (err) {
    console.error(
      `[grade-genuine-heal] cannot read proof file ${proofPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    console.error('[grade-genuine-heal] run scripts/run-genuine-heal.ts first.')
    process.exitCode = 1
    return
  }

  const rows = extractRows(artifact.envelope?.preview_result)
  console.log('[grade-genuine-heal] proof file :', proofPath)
  console.log('[grade-genuine-heal] collector  :', artifact.collectorId ?? '(unknown)')
  console.log('[grade-genuine-heal] healed at  :', artifact.capturedAt ?? '(unknown)')
  console.log(`[grade-genuine-heal] extracted ${rows.length} row(s) from preview_result`)
  console.log('')

  const { gradeGenuineHealPreview } = await import(
    '../src/grader/repairGrader.js'
  )
  const registry = await import('../src/collectors/mandi-registry.js')
  const mumbai = registry.MANDI_COLLECTORS.mumbai_apmc

  const report = gradeGenuineHealPreview({ rows })

  console.log('================ GRADE REPORT ================')
  for (const check of report.checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.name}`)
    console.log(`      ${check.details}`)
  }
  console.log('----------------------------------------------')
  console.log(`score     : ${report.score} (${report.checks.filter((c) => c.passed).length}/${report.checks.length} checks passed)`)
  console.log(`threshold : ${report.threshold}`)
  console.log(`verdict   : ${report.approved ? 'APPROVED - safe to promote' : 'NOT APPROVED'}`)
  console.log('==============================================')

  if (report.approved) {
    console.log('')
    console.log('Run this manually to approve the heal:')
    console.log(
      `  npx -p @brightdata/cli bdata scraper approve ${mumbai.collectorId} --url ${mumbai.sourceUrl}`,
    )
    process.exitCode = 0
  } else {
    console.log('')
    console.log(
      '[grade-genuine-heal] score below threshold - do NOT approve. Inspect failing checks above.',
    )
    process.exitCode = 2
  }
}

void main().catch((err: unknown) => {
  console.error('[grade-genuine-heal] UNEXPECTED ERROR:', err instanceof Error ? err.stack : String(err))
  process.exitCode = 1
})
