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
  emit(response.ok)
  return response
}
