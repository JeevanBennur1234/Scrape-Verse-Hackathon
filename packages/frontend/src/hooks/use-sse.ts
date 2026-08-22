import { useEffect, useRef, useState } from 'react'

import { apiUrl } from '@/lib/api'

export interface SseEvent {
  id: string
  type: string
  timestamp: string
  payload: Record<string, unknown>
}

export interface UseSSEOptions {
  url?: string
  filter?: (type: string) => boolean
  limit?: number
}

export type SSEStatus = 'connecting' | 'open' | 'error'

export function useSSE(options: UseSSEOptions = {}): {
  events: SseEvent[]
  lastEvent: SseEvent | null
  status: SSEStatus
} {
  const { url = apiUrl('/api/stream'), filter, limit = 200 } = options
  const [events, setEvents] = useState<SseEvent[]>([])
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const seenIds = useRef(new Set<string>())
  const filterRef = useRef(filter)

  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  useEffect(() => {
    const source = new EventSource(url)

    source.onopen = () => setStatus('open')
    source.onerror = () => setStatus('error')
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SseEvent
        if (filterRef.current && !filterRef.current(event.type)) return
        if (seenIds.current.has(event.id)) return
        seenIds.current.add(event.id)
        setEvents((prev) => [...prev.slice(-(limit - 1)), event])
      } catch {
        // ignore malformed frames
      }
    }

    return () => source.close()
  }, [url, limit])

  return { events, lastEvent: events[events.length - 1] ?? null, status }
}
