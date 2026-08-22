import { PrismaClient } from '@prisma/client'
import { COLLECTORS, hasRealCollectorId } from '../src/collectors/mandi-registry.js'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  for (const collector of COLLECTORS) {
    const isPending = !hasRealCollectorId(collector)
    await prisma.collector.upsert({
      where: { id: collector.collectorId },
      update: {
        name: collector.name,
        portalUrl: collector.sourceUrl,
        ...(isPending ? { status: 'PENDING_SETUP' } : {}),
      },
      create: {
        id: collector.collectorId,
        name: collector.name,
        portalUrl: collector.sourceUrl,
        status: isPending ? 'PENDING_SETUP' : 'HEALTHY',
        lastGoodSelectors: Object.fromEntries(
          collector.expectedFields.map((field) => [field, `.${field}`]),
        ),
      },
    })
    console.log(`[seed] upserted collector "${collector.key}" (${isPending ? 'PENDING_SETUP' : 'active'})`)
  }
  console.log(`[seed] done — ${COLLECTORS.length} collector(s) seeded`)
}

main()
  .catch((err: unknown) => {
    console.error('[seed] error:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
