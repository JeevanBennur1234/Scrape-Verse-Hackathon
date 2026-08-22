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
// Each entry ALSO accepts Vercel-style deployment aliases of itself:
//   https://my-app.vercel.app also matches https://my-app-<deploy-hash>.vercel.app
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  return frontendOrigins.some((allowed) => {
    if (origin === allowed) return true
    try {
      const originHost = new URL(origin).hostname
      const allowedHost = new URL(allowed).hostname
      if (originHost === allowedHost) return true
      // Vercel-style deployment aliases: <project>-<hash><domain-suffix> derived from <project><domain-suffix>
      const labels = allowedHost.split('.')
      if (labels.length < 3) return false
      const suffix = `.${labels.slice(-2).join('.')}`
      const base = allowedHost.slice(0, -suffix.length)
      if (base.length === 0) return false
      const rest = originHost.slice(base.length)
      return (
        originHost.startsWith(`${base}-`) &&
        originHost.endsWith(suffix) &&
        /^-[a-z0-9]+\./i.test(rest)
      )
    } catch {
      return false
    }
  })
}

await app.register(cors, {
  origin:
    frontendOrigins.length > 0
      ? (_origin, callback) => callback(null, originAllowed(_origin))
      : true,
})

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
