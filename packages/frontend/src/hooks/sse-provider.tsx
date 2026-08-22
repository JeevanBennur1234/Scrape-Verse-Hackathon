import { createContext, useEffect, useState, useRef, type ReactNode } from 'react'

import { apiUrl } from '@/lib/api'
import type { SseEvent, SSEStatus } from './use-sse'

interface SSEContextType {
  status: SSEStatus
  events: SseEvent[]
  subscribe: (listener: (event: SseEvent) => void) => () => void
}

export const SSEContext = createContext<SSEContextType | null>(null)

export function SSEProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const [events, setEvents] = useState<SseEvent[]>([])
  const listenersRef = useRef<Set<(event: SseEvent) => void>>(new Set())

  useEffect(() => {
    const url = apiUrl('/api/stream')
    const source = new EventSource(url)

    source.onopen = () => setStatus('open')
    source.onerror = () => setStatus('error')
    source.onmessage = (message) => {
      try {
        let rawData = message.data
        let parsed = JSON.parse(rawData)
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed)
        }
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
          return
        }
        const event = parsed as SseEvent
        setEvents((prev) => [...prev, event])
        listenersRef.current.forEach((listener) => listener(event))
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      source.close()
    }
  }, [])

  const subscribe = (listener: (event: SseEvent) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }

  return (
    <SSEContext.Provider value={{ status, events, subscribe }}>
      {children}
    </SSEContext.Provider>
  )
}
