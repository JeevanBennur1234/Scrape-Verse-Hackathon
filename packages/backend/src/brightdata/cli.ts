import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..', '..')
const LOGS_DIR = path.join(BACKEND_ROOT, 'logs')

const DEFAULT_CLI_TIMEOUT_SECONDS = 1800
const EXEC_TIMEOUT_BUFFER_MS = 30_000

export interface CliResult<T> {
  ok: boolean
  data?: T
  error?: string
  logPath: string
}

export interface CreateCollectorData {
  collectorId: string
}

export interface RunCollectorData {
  records: unknown
  outputFilePath: string
}

export interface HealEnvelope {
  status?: string
  preview_result?: unknown
  diff_summary?: string
  next_step?: string
  [key: string]: unknown
}

export interface HealCollectorData {
  envelope: HealEnvelope | null
}

export interface ApproveHealData {
  envelope: HealEnvelope | null
}

export interface AuthCheckData {
  authenticated: boolean
  reason?: string
}

export interface BdataCallOptions {
  timeoutSeconds?: number
}

interface CommandRunOutcome {
  logPath: string
  raw: string
  exitCode: number | null
  timedOut: boolean
  spawnError?: string
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function resolveNpx(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function resolveApiKey(): string | undefined {
  return process.env.BRIGHTDATA_API_KEY ?? process.env.BRIGHTDATA_API_TOKEN
}

function childEnv(): NodeJS.ProcessEnv {
  const key = resolveApiKey()
  if (!key) return { ...process.env }
  return {
    ...process.env,
    BRIGHTDATA_API_KEY: key,
    BRIGHTDATA_API_TOKEN: key,
  }
}

async function runBdataCommand(
  args: string[],
  logLabel: string,
  options: BdataCallOptions = {},
): Promise<CommandRunOutcome> {
  await mkdir(LOGS_DIR, { recursive: true })
  const logPath = path.join(LOGS_DIR, `${logLabel}-${timestampSlug()}.log`)
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_CLI_TIMEOUT_SECONDS
  const stream = createWriteStream(logPath, { encoding: 'utf8' })

  let exitCode: number | null = null
  let timedOut = false
  let spawnError: string | undefined

  try {
    const result = await execa(resolveNpx(), ['-p', '@brightdata/cli', 'bdata', ...args], {
      timeout: timeoutSeconds * 1000 + EXEC_TIMEOUT_BUFFER_MS,
      killSignal: 'SIGKILL',
      cleanup: true,
      windowsHide: true,
      reject: false,
      env: childEnv(),
      stdout: stream,
      stderr: stream,
    })
    exitCode = result.exitCode ?? null
    timedOut = result.timedOut ?? false
    if (result.shortMessage && result.exitCode !== 0) {
      spawnError = result.shortMessage
    }
  } catch (err) {
    spawnError = err instanceof Error ? err.message : String(err)
  } finally {
    await new Promise<void>((resolve) => {
      if (stream.writableEnded) {
        resolve()
        return
      }
      stream.end(() => resolve())
    })
  }

  let raw = ''
  try {
    raw = await readFile(logPath, 'utf8')
  } catch {
    raw = ''
  }

  return { logPath, raw, exitCode, timedOut, spawnError }
}

function extractCollectorId(raw: string): string | undefined {
  const afterTemplate = raw.match(/Template created:\s*(c_[a-z0-9]+)/i)
  if (afterTemplate?.[1]) return afterTemplate[1]
  const anyMatch = raw.match(/\b(c_[a-z0-9]+)\b/)
  return anyMatch?.[1]
}

function extractLastJsonObject(raw: string): unknown | undefined {
  const cleaned = raw.replace(/```(?:json)?/gi, '')
  let searchFrom = cleaned.length
  while (searchFrom > 0) {
    const braceIndex = cleaned.lastIndexOf('\n{', searchFrom - 1)
    if (braceIndex === -1) break
    const candidate = cleaned.slice(braceIndex + 1).trim()
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      searchFrom = braceIndex
    }
  }
  try {
    return JSON.parse(cleaned.trim()) as unknown
  } catch {
    return undefined
  }
}

function extractErrorSummary(raw: string): string | undefined {
  const quotedError = raw.match(/"error"\s*:\s*"([^"]+)"/)
  if (quotedError?.[1]) return quotedError[1]
  const patterns = [
    /Failed to [^\n]+/,
    /Error: [^\n]+/,
    /HTTP \d+[^\n]*/,
    /Access denied[^\n]*/,
  ]
  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (match?.[0]) return match[0].trim().slice(0, 300)
  }
  return undefined
}

let authWarningEmitted = false

export async function checkBdataAuth(
  options: BdataCallOptions = {},
): Promise<CliResult<AuthCheckData>> {
  if (!resolveApiKey()) {
    return {
      ok: false,
      error: 'No BRIGHTDATA_API_KEY or BRIGHTDATA_API_TOKEN set in environment',
      logPath: '',
    }
  }
  const outcome = await runBdataCommand(['budget'], 'auth-budget', options)
  if (outcome.exitCode === 0 && !outcome.spawnError) {
    return { ok: true, data: { authenticated: true }, logPath: outcome.logPath }
  }
  const reason =
    outcome.spawnError ??
    extractErrorSummary(outcome.raw) ??
    (outcome.timedOut ? 'budget check timed out' : `budget exited with code ${outcome.exitCode}`)
  return {
    ok: true,
    data: { authenticated: false, reason },
    error: reason,
    logPath: outcome.logPath,
  }
}

export function scheduleStartupAuthCheck(): void {
  void checkBdataAuth({ timeoutSeconds: 60 }).then((result) => {
    if (!result.ok) {
      console.warn(`[bdata] auth check failed: ${result.error}`)
      return
    }
    if (result.data && !result.data.authenticated && !authWarningEmitted) {
      authWarningEmitted = true
      console.warn(
        `[bdata] API key present but limited: ${result.data.reason ?? 'unknown reason'}. Continuing anyway.`,
      )
    }
  })
}

async function guardAuth(): Promise<string | undefined> {
  if (resolveApiKey()) return undefined
  if (!authWarningEmitted) {
    authWarningEmitted = true
    console.warn('[bdata] no API key in environment; calls will fail until BRIGHTDATA_API_KEY/TOKEN is set')
  }
  return 'No API key found in environment (set BRIGHTDATA_API_KEY or BRIGHTDATA_API_TOKEN)'
}

export async function createCollector(
  url: string,
  description: string,
  options: BdataCallOptions & { name?: string } = {},
): Promise<CliResult<CreateCollectorData>> {
  const missing = await guardAuth()
  if (missing) return { ok: false, error: missing, logPath: '' }

  const args = ['scraper', 'create', url, description]
  if (options.name) args.push('--name', options.name)
  args.push('--timeout', String(options.timeoutSeconds ?? DEFAULT_CLI_TIMEOUT_SECONDS))

  const outcome = await runBdataCommand(args, 'create', options)
  if (outcome.exitCode !== 0 || outcome.spawnError || outcome.timedOut) {
    return {
      ok: false,
      error:
        outcome.spawnError ??
        extractErrorSummary(outcome.raw) ??
        (outcome.timedOut ? 'create timed out' : `create exited with code ${outcome.exitCode}`),
      logPath: outcome.logPath,
    }
  }
  const collectorId = extractCollectorId(outcome.raw)
  if (!collectorId) {
    return {
      ok: false,
      error: 'create finished but no collector_id (c_*) found in output',
      logPath: outcome.logPath,
    }
  }
  void scheduleStartupAuthCheckOnce()
  return { ok: true, data: { collectorId }, logPath: outcome.logPath }
}

export async function runCollector(
  collectorId: string,
  url: string,
  options: BdataCallOptions = {},
): Promise<CliResult<RunCollectorData>> {
  const missing = await guardAuth()
  if (missing) return { ok: false, error: missing, logPath: '' }

  await mkdir(LOGS_DIR, { recursive: true })
  const ts = timestampSlug()
  const outputFilePath = path.join(LOGS_DIR, `run-${collectorId}-${ts}.json`)
  const args = [
    'scraper',
    'run',
    collectorId,
    url,
    '--pretty',
    '-o',
    outputFilePath,
    '--timeout',
    String(options.timeoutSeconds ?? DEFAULT_CLI_TIMEOUT_SECONDS),
  ]

  const outcome = await runBdataCommand(args, `run-${collectorId}`, options)
  if (outcome.exitCode !== 0 || outcome.spawnError || outcome.timedOut) {
    return {
      ok: false,
      error:
        outcome.spawnError ??
        extractErrorSummary(outcome.raw) ??
        (outcome.timedOut ? 'run timed out' : `run exited with code ${outcome.exitCode}`),
      logPath: outcome.logPath,
    }
  }

  try {
    const stats = await stat(outputFilePath)
    if (stats.size === 0) throw new Error('empty output file')
  } catch {
    return {
      ok: false,
      error: extractErrorSummary(outcome.raw) ?? `run produced no output file at ${outputFilePath}`,
      logPath: outcome.logPath,
    }
  }

  let records: unknown
  try {
    const content = await readFile(outputFilePath, 'utf8')
    records = JSON.parse(content) as unknown
  } catch (err) {
    return {
      ok: false,
      error: `could not parse output file: ${err instanceof Error ? err.message : String(err)}`,
      logPath: outcome.logPath,
    }
  }

  void scheduleStartupAuthCheckOnce()
  return { ok: true, data: { records, outputFilePath }, logPath: outcome.logPath }
}

export async function healCollector(
  collectorId: string,
  diagnosis: string,
  options: BdataCallOptions & { url?: string } = {},
): Promise<CliResult<HealCollectorData>> {
  const missing = await guardAuth()
  if (missing) return { ok: false, error: missing, logPath: '' }

  const args = ['scraper', 'heal', collectorId, diagnosis]
  if (options.url) args.push('--url', options.url)
  args.push('--timeout', String(options.timeoutSeconds ?? DEFAULT_CLI_TIMEOUT_SECONDS))

  const outcome = await runBdataCommand(args, `heal-${collectorId}`, options)
  if (outcome.exitCode !== 0 || outcome.spawnError || outcome.timedOut) {
    return {
      ok: false,
      error:
        outcome.spawnError ??
        extractErrorSummary(outcome.raw) ??
        (outcome.timedOut ? 'heal timed out' : `heal exited with code ${outcome.exitCode}`),
      logPath: outcome.logPath,
    }
  }
  const envelope = extractLastJsonObject(outcome.raw)
  void scheduleStartupAuthCheckOnce()
  return {
    ok: true,
    data: { envelope: (envelope as HealEnvelope | undefined) ?? null },
    logPath: outcome.logPath,
  }
}

export async function approveHeal(
  collectorId: string,
  options: BdataCallOptions & { url?: string; reject?: boolean } = {},
): Promise<CliResult<ApproveHealData>> {
  const missing = await guardAuth()
  if (missing) return { ok: false, error: missing, logPath: '' }

  const args = ['scraper', 'approve', collectorId]
  if (options.reject) args.push('--reject')
  if (options.url) args.push('--url', options.url)

  const outcome = await runBdataCommand(args, `approve-${collectorId}`, options)
  if (outcome.exitCode !== 0 || outcome.spawnError || outcome.timedOut) {
    return {
      ok: false,
      error:
        outcome.spawnError ??
        extractErrorSummary(outcome.raw) ??
        (outcome.timedOut ? 'approve timed out' : `approve exited with code ${outcome.exitCode}`),
      logPath: outcome.logPath,
    }
  }
  const envelope = extractLastJsonObject(outcome.raw)
  return {
    ok: true,
    data: { envelope: (envelope as HealEnvelope | undefined) ?? null },
    logPath: outcome.logPath,
  }
}

let startupAuthCheckScheduled = false

function scheduleStartupAuthCheckOnce(): void {
  if (startupAuthCheckScheduled) return
  startupAuthCheckScheduled = true
  scheduleStartupAuthCheck()
}

export class BdataCliError extends Error {
  public readonly exitCode: string | number | null
  public readonly stdout: string
  public readonly stderr: string
  public readonly timedOut: boolean
  public readonly logPath: string

  constructor(
    message: string,
    details: {
      exitCode?: string | number | null
      stdout?: string
      stderr?: string
      timedOut?: boolean
      logPath?: string
    } = {},
  ) {
    super(message)
    this.name = 'BdataCliError'
    this.exitCode = details.exitCode ?? null
    this.stdout = details.stdout ?? ''
    this.stderr = details.stderr ?? ''
    this.timedOut = details.timedOut ?? false
    this.logPath = details.logPath ?? ''
  }
}

export interface BdataHealResult {
  success: boolean
  collectorId: string
  diagnosis: string
  output: string
  stderr: string
  parsed?: unknown
  logPath: string
}

export async function runBdataHeal(
  collectorId: string,
  diagnosis: string,
  options: BdataCallOptions & { url?: string } = {},
): Promise<BdataHealResult> {
  if (!collectorId || !diagnosis) {
    throw new BdataCliError('collectorId and diagnosis are required', { exitCode: 'INVALID_ARGS' })
  }
  const result = await healCollector(collectorId, diagnosis, options)
  if (!result.ok || !result.data) {
    throw new BdataCliError(result.error ?? 'bdata heal failed', {
      stdout: '',
      stderr: result.error ?? '',
      logPath: result.logPath,
    })
  }
  return {
    success: true,
    collectorId,
    diagnosis,
    output: JSON.stringify(result.data.envelope ?? {}),
    stderr: '',
    parsed: result.data.envelope ?? undefined,
    logPath: result.logPath,
  }
}
