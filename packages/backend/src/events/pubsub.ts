import { randomUUID } from 'node:crypto'

export interface StructuredEvent {
  id: string
  type: string
  timestamp: Date
  payload: unknown
}

export type EventListener = (event: StructuredEvent) => void

export const ALL_EVENTS = '*'

const HISTORY_LIMIT = 100

class InMemoryPubSub {
  private readonly listeners = new Map<string, Set<EventListener>>()
  private readonly history: StructuredEvent[] = []

  subscribe(type: string, listener: EventListener): () => void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
    return () => {
      listeners.delete(listener)
    }
  }

  publish(type: string, payload: unknown): StructuredEvent {
    const event: StructuredEvent = {
      id: randomUUID(),
      type,
      timestamp: new Date(),
      payload,
    }
    this.history.push(event)
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift()
    }
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
    for (const listener of this.listeners.get(ALL_EVENTS) ?? []) {
      listener(event)
    }
    return event
  }

  getHistory(type?: string): StructuredEvent[] {
    if (!type) return [...this.history]
    return this.history.filter((event) => event.type === type)
  }

  async *streamAllWithReplay(): AsyncGenerator<StructuredEvent> {
    const queue: StructuredEvent[] = []
    let notify: (() => void) | undefined
    const unsubscribe = this.subscribe(ALL_EVENTS, (event) => {
      queue.push(event)
      notify?.()
    })

    try {
      const seen = new Set<string>()
      for (const event of [...this.history]) {
        seen.add(event.id)
        yield event
      }
      for (;;) {
        while (queue.length > 0) {
          const event = queue.shift()
          if (!event || seen.has(event.id)) continue
          seen.add(event.id)
          yield event
        }
        await new Promise<void>((resolve) => {
          notify = resolve
        })
      }
    } finally {
      unsubscribe()
    }
  }

  clear(): void {
    this.history.length = 0
  }
}

export const eventBus = new InMemoryPubSub()
