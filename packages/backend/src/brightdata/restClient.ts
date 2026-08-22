export const BRIGHTDATA_API_BASE = 'https://api.brightdata.com'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_MS = 10 * 60 * 1000

export interface TriggerOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export interface TriggerSnapshotResult {
  snapshotId: string
}

export class BrightDataApiError extends Error {
  public readonly status: number
  public readonly code?: string
  public readonly body?: unknown

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message)
    this.name = 'BrightDataApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

interface BrightDataErrorPayload {
  error?: { code?: string; message?: string }
  message?: string
}

function authHeaders(): Record<string, string> {
  const token = process.env.BRIGHTDATA_API_TOKEN
  if (!token) {
    throw new BrightDataApiError(
      'BRIGHTDATA_API_TOKEN is not set in the environment',
      0,
      'MISSING_TOKEN',
    )
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const payload = body as BrightDataErrorPayload | undefined
  return payload?.error?.message ?? payload?.message ?? fallback
}

export async function triggerCollector(
  collectorId: string,
  url: string,
  options: TriggerOptions = {},
): Promise<TriggerSnapshotResult> {
  const timeoutMs = options.timeoutMs ?? 60_000

  let response: Response
  try {
    response = await fetch(
      `${BRIGHTDATA_API_BASE}/dca/trigger?collector=${encodeURIComponent(collectorId)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify([{ url }]),
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      },
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new BrightDataApiError(
        `Trigger request timed out after ${timeoutMs}ms`,
        0,
        'TIMEOUT',
      )
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw new BrightDataApiError(
      `Network error calling /dca/trigger: ${err instanceof Error ? err.message : String(err)}`,
      0,
      'NETWORK_ERROR',
    )
  }

  const body = await parseBody(response)

  if (!response.ok) {
    throw new BrightDataApiError(
      extractErrorMessage(body, `Trigger failed with HTTP ${response.status}`),
      response.status,
      'TRIGGER_FAILED',
      body,
    )
  }

  const snapshotId =
    typeof body === 'object' && body !== null
      ? ((body as Record<string, unknown>).id ??
        (body as Record<string, unknown>).snapshot_id ??
        (body as Record<string, unknown>).collection_id)
      : undefined

  if (typeof snapshotId !== 'string' || snapshotId === '') {
    throw new BrightDataApiError(
      'Unexpected trigger response: no snapshot id returned',
      response.status,
      'BAD_RESPONSE',
      body,
    )
  }

  return { snapshotId }
}

function extractRecordsArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    for (const key of ['data', 'records', 'items', 'results']) {
      const candidate = record[key]
      if (Array.isArray(candidate)) return candidate
    }
  }
  return []
}

export interface PollOptions extends TriggerOptions {
  intervalMs?: number
  maxPollMs?: number
}

export async function pollDataset(
  snapshotId: string,
  options: PollOptions = {},
): Promise<unknown[]> {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS
  const maxPollMs = options.maxPollMs ?? MAX_POLL_MS
  const deadline = Date.now() + maxPollMs
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    let body: unknown
    let status = 0
    try {
      const response = await fetch(
        `${BRIGHTDATA_API_BASE}/dca/dataset?id=${encodeURIComponent(snapshotId)}`,
        {
          method: 'GET',
          headers: authHeaders(),
          signal: options.signal ?? AbortSignal.timeout(30_000),
        },
      )
      status = response.status
      body = await parseBody(response)

      if (response.ok) {
        const records = extractRecordsArray(body)
        if (records.length > 0) return records
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      body = `poll network error: ${err instanceof Error ? err.message : String(err)}`
    }

    console.log(
      `[restClient] poll #${attempt} snapshot=${snapshotId} status=${status} no data yet; retrying in ${intervalMs}ms`,
    )
    await sleep(intervalMs)
  }

  throw new BrightDataApiError(
    `Dataset ${snapshotId} did not return a non-empty array within ${Math.round(maxPollMs / 1000)}s`,
    0,
    'POLL_TIMEOUT',
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function collectSnapshot(
  collectorId: string,
  url: string,
  options: PollOptions = {},
): Promise<unknown[]> {
  const { snapshotId } = await triggerCollector(collectorId, url, options)
  return pollDataset(snapshotId, options)
}
