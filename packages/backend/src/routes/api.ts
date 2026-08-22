import { fastifySSE } from '@fastify/sse'
import type { FastifyInstance } from 'fastify'

import { prisma } from '../db.js'
import { partitionCollectors, COLLECTORS, hasRealCollectorId } from '../collectors/mandi-registry.js'
import { eventBus, type StructuredEvent } from '../events/pubsub.js'

const INCIDENT_STATUSES = ['DETECTED', 'HEALING', 'GRADED', 'RECOVERED', 'ESCALATED'] as const
const INCIDENT_TYPES = ['SCHEMA_DRIFT', 'NULL_SPIKE', 'PRICE_OUTLIER'] as const

interface PricesQuery {
  collectorId?: string
}

interface IncidentsQuery {
  status?: string
  type?: string
  limit?: string
}

export default async function apiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifySSE)

  app.get('/collectors', async () => {
    const dbRows = await prisma.collector.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { priceTicks: true, incidents: true } } },
    })

    const registeredIds = new Set(COLLECTORS.map((c) => c.collectorId))
    const allowedIds = new Set([...registeredIds, 'PENDING'])

    let filteredRows = dbRows.filter((r) => allowedIds.has(r.id))
    filteredRows = filteredRows.map((r) => {
      if (r.id === 'PENDING' || r.id === 'c_msamb_pending') {
        return { ...r, status: 'PENDING_SETUP' }
      }
      return r
    })

    const { pending } = partitionCollectors()
    const dbIds = new Set(filteredRows.map((r) => r.id))

    const pendingEntries = pending
      .filter((c) => !dbIds.has(c.collectorId))
      .map((c) => ({
        id: c.collectorId,
        name: c.name,
        portalUrl: c.sourceUrl,
        state: 'IDLE',
        status: 'PENDING_SETUP',
        lastGoodSelectors: {},
        _count: { priceTicks: 0, incidents: 0 },
      }))

    return [...filteredRows, ...pendingEntries]
  })

  app.get<{ Querystring: PricesQuery }>('/prices', async (request) => {
    const activeCollectorIds = COLLECTORS.filter(hasRealCollectorId).map((c) => c.collectorId)
    const whereClause = request.query.collectorId
      ? { collectorId: request.query.collectorId }
      : { collectorId: { in: activeCollectorIds } }

    const ticks = await prisma.priceTick.findMany({
      where: whereClause,
      orderBy: { recordedAt: 'desc' },
      take: 2000,
      include: { collector: { select: { name: true, status: true } } },
    })

    const latestByKey = new Map<string, (typeof ticks)[number]>()
    const prevByKey = new Map<string, number>()
    for (const tick of ticks) {
      const key = `${tick.collectorId}::${tick.commodity}`
      if (!latestByKey.has(key)) {
        latestByKey.set(key, tick)
      } else if (!prevByKey.has(key)) {
        prevByKey.set(key, tick.modalPrice)
      }
    }

    return [...latestByKey.values()].map((tick) => ({
      id: tick.id,
      collectorId: tick.collectorId,
      collectorName: tick.collector.name,
      collectorStatus: tick.collector.status,
      commodity: tick.commodity,
      market: tick.market,
      modalPrice: tick.modalPrice,
      previousModalPrice: prevByKey.get(`${tick.collectorId}::${tick.commodity}`) ?? null,
      minPrice: tick.minPrice,
      maxPrice: tick.maxPrice,
      arrivalQty: tick.arrivalQty,
      recordedAt: tick.recordedAt,
    }))
  })

  app.get<{ Querystring: IncidentsQuery }>('/incidents', async (request, reply) => {
    const { status, type } = request.query
    if (status && !INCIDENT_STATUSES.includes(status as (typeof INCIDENT_STATUSES)[number])) {
      return reply.code(400).send({ error: `Invalid status: ${status}` })
    }
    if (type && !INCIDENT_TYPES.includes(type as (typeof INCIDENT_TYPES)[number])) {
      return reply.code(400).send({ error: `Invalid type: ${type}` })
    }

    const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 200)
    const allowedCollectorIds = [...COLLECTORS.map((c) => c.collectorId), 'PENDING']

    return prisma.incident.findMany({
      where: {
        collectorId: { in: allowedCollectorIds },
        ...(status ? { status: status as (typeof INCIDENT_STATUSES)[number] } : {}),
        ...(type ? { type: type as (typeof INCIDENT_TYPES)[number] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        collector: { select: { name: true } },
        grades: { orderBy: { createdAt: 'desc' } },
      },
    })
  })

  app.get('/stream', { sse: 'only' }, async (_request, reply) => {
    reply.sse.sendHeaders()
    reply.raw.write(': ping\n\n')

    const pingInterval = setInterval(() => {
      if (reply.sse.isConnected) {
        reply.raw.write(': ping\n\n')
      } else {
        clearInterval(pingInterval)
      }
    }, 15000)

    reply.sse.onClose(() => {
      clearInterval(pingInterval)
    })

    await reply.sse.send(streamHealEvents())
  })
}

function streamHealEvents(): AsyncGenerator<{ id: string; data: any }> {
  return (async function* () {
    for await (const event of eventBus.streamAllWithReplay()) {
      yield serializeEvent(event)
    }
  })()
}

function serializeEvent(event: StructuredEvent): { id: string; data: any } {
  return {
    id: event.id,
    data: event,
  }
}
