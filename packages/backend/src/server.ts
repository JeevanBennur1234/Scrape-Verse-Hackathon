import 'dotenv/config'

import cors from '@fastify/cors'
import Fastify from 'fastify'

import { logRegistryState } from './collectors/mandi-registry.js'
import { ensureAllCollectorRows } from './watchdog/scheduler.js'
import apiRoutes from './routes/api.js'
import simulateRoutes from './routes/simulate.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
})

// FRONTEND_ORIGIN: comma-separated allowlist of browser origins allowed to call the API.
// Unset (local dev) -> reflect any origin. Set in production -> only listed origins pass CORS.
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

await app.register(cors, { origin: frontendOrigins.length > 0 ? frontendOrigins : true })

await app.register(apiRoutes, { prefix: '/api' })
await app.register(simulateRoutes, { prefix: '/api' })

app.get('/', async () => ({
  status: 'ok',
  service: 'mandipulse-backend',
  health: '/health',
  api: ['/api/collectors', '/api/prices', '/api/incidents', '/api/stream', '/api/simulate-drift'],
}))

app.get('/health', async () => ({ status: 'ok' }))

logRegistryState()
await ensureAllCollectorRows()

const port = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
