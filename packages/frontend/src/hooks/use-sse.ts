import { useContext, useEffect, useRef, useState } from 'react'

import { SSEContext } from './sse-provider'

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
  const context = useContext(SSEContext)
  if (!context) {
    throw new Error('useSSE must be used within an SSEProvider')
  }

  const { filter, limit = 200 } = options
  const [localEvents, setLocalEvents] = useState<SseEvent[]>([])
  const seenIds = useRef(new Set<string>())
  const filterRef = useRef(filter)

  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  useEffect(() => {
    const filteredHistory: SseEvent[] = []
    seenIds.current.clear()
    for (const event of context.events) {
      if (seenIds.current.has(event.id)) continue
      if (filterRef.current && !filterRef.current(event.type)) continue
      seenIds.current.add(event.id)
      filteredHistory.push(event)
    }
    setLocalEvents(filteredHistory.slice(-limit))

    const unsubscribe = context.subscribe((event) => {
      if (seenIds.current.has(event.id)) return
      if (filterRef.current && !filterRef.current(event.type)) return
      seenIds.current.add(event.id)
      setLocalEvents((prev) => [...prev.slice(-(limit - 1)), event])
    })

    return unsubscribe
  }, [context, limit])

  return {
    events: localEvents,
    lastEvent: localEvents[localEvents.length - 1] ?? null,
    status: context.status,
  }
}
