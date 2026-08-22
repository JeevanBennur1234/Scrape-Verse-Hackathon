const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

export const API_BASE_DISPLAY = API_BASE === '' ? '(relative — same origin)' : API_BASE

console.info(`[config] API base: ${API_BASE_DISPLAY}`)

type ApiStatusListener = (reachable: boolean) => void
const listeners = new Set<ApiStatusListener>()

function emit(reachable: boolean): void {
  for (const listener of listeners) listener(reachable)
}

export function subscribeApiStatus(listener: ApiStatusListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Drop-in fetch for API paths: reports success/failure to the global status
// store so the header badge can reflect real connectivity, not guesses.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), init)
  } catch (err) {
    emit(false)
    throw err
  }
  if (response.status >= 500 && response.status < 600) {
    emit(false)
  } else {
    emit(true)
  }
  return response
}

export type Collector = {
  id: string
  name: string
  portalUrl: string
  status: string
  state?: string
  _count?: { priceTicks: number; incidents: number }
}

export type PriceRow = {
  id: string
  collectorId: string
  collectorName: string
  collectorStatus?: string
  commodity: string
  market: string
  modalPrice: number
  previousModalPrice: number | null
  minPrice: number
  maxPrice: number
  arrivalQty: number
  recordedAt: string
}

export type GradeRow = {
  id: string
  score: number
  reason: string
  checks?: Array<{ name: string; passed: boolean; details?: string }>
  createdAt: string
}

export type IncidentRow = {
  id: string
  collectorId: string
  type: string
  field: string
  symptom: string
  affectedRatio: number
  status: string
  simulated?: boolean
  createdAt: string
  collector?: { name: string }
  grades: GradeRow[]
}

export type SseEvent = {
  id: string
  type: string
  timestamp: string
  payload: Record<string, any>
}

export function parseSseData(raw: string): SseEvent | null {
  try {
    let value: any = JSON.parse(raw)
    if (typeof value === "string") value = JSON.parse(value)
    if (!value || typeof value !== "object") return null
    const event = value as SseEvent
    if (typeof event.type !== "string") return null
    return event
  } catch {
    return null
  }
}
