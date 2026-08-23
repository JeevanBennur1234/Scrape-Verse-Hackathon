export interface MandiCollectorConfig {
  collectorId: string
  name: string
  state: string
  sourceUrl: string
  rawFields: string[]
  status?: string
  pendingReason?: string
}

export const MANDI_COLLECTORS = {
  mumbai_apmc: {
    collectorId: 'c_mt364sxr1jxad1qpuy',
    name: 'Mumbai Market (CommodityOnline)',
    state: 'Maharashtra',
    sourceUrl: 'https://www.commodityonline.com/mandi-prices/maharashtra/mumbai',
    rawFields: [
      'commodity',
      'market',
      'min_price',
      'max_price',
      'modal_price',
      'report_date',
    ],
  },
  msamb: {
    collectorId: 'c_msamb_pending',
    name: 'MSAMB APMC Price Info (Karnataka/MSAMB)',
    state: 'Karnataka',
    sourceUrl: 'https://www.msamb.com/ApmcDetail/APMCPriceInformation',
    rawFields: [],
    status: 'PENDING_SETUP',
  },
  azadpur_apmc: {
    collectorId: 'c_mt5j49381jk8a4x4g0',
    name: 'Azadpur APMC (Delhi)',
    state: 'Delhi',
    sourceUrl: 'https://apmcazadpurdelhi.com/',
    rawFields: [],
    status: 'PENDING_SETUP',
    pendingReason: 'Collector created and smoke-tested successfully, but the AI-generated template extracted site navigation/bulletin links rather than the actual min/max rate table — needs a scraper heal pass to retarget extraction, deferred due to hackathon time constraints.',
  },
} satisfies Record<string, MandiCollectorConfig>

export type CollectorKey = keyof typeof MANDI_COLLECTORS

const REAL_COLLECTOR_ID_PATTERN = /^c_[a-z0-9]+$/

export interface CollectorDefinition extends MandiCollectorConfig {
  key: CollectorKey
  portalUrl: string
  expectedFields: string[]
}

function toDefinition(key: CollectorKey, config: MandiCollectorConfig): CollectorDefinition {
  return {
    ...config,
    key,
    portalUrl: config.sourceUrl,
    expectedFields: config.rawFields,
  }
}

export const COLLECTORS: CollectorDefinition[] = (
  Object.entries(MANDI_COLLECTORS) as [CollectorKey, MandiCollectorConfig][]
).map(([key, config]) => toDefinition(key, config))

export function hasRealCollectorId(definition: CollectorDefinition): boolean {
  return REAL_COLLECTOR_ID_PATTERN.test(definition.collectorId) && 
         definition.collectorId !== 'c_msamb_pending' &&
         definition.status !== 'PENDING_SETUP'
}

export interface PartitionedCollectors {
  active: CollectorDefinition[]
  pending: CollectorDefinition[]
}

export function partitionCollectors(): PartitionedCollectors {
  const active: CollectorDefinition[] = []
  const pending: CollectorDefinition[] = []
  for (const c of COLLECTORS) {
    if (hasRealCollectorId(c)) {
      active.push(c)
    } else {
      pending.push(c)
    }
  }
  if (pending.length > 0) {
    const keys = pending.map((c) => c.key).join(', ')
    console.warn(
      `[registry] ${pending.length} pending collector(s) skipped (no real c_* id): ${keys}. ` +
        'Run scripts/create-msamb-collector.ts and update mandi-registry.ts to activate.',
    )
  }
  return { active, pending }
}

export function logRegistryState(): void {
  const { active, pending } = partitionCollectors()
  const pendingKeys = pending.map((c) => c.key).join(', ')
  console.log(
    `[registry] ${active.length} active collector(s), ${pending.length} pending (skipped)${
      pending.length > 0 ? `: ${pendingKeys}` : ''
    }`,
  )
}

/** @deprecated No longer throws — use partitionCollectors() instead. Kept for call-site compatibility. */
export class PendingCollectorError extends Error {
  constructor(pendingKeys: string[]) {
    super(`collectorId still PENDING for [${pendingKeys.join(', ')}]`)
    this.name = 'PendingCollectorError'
  }
}

/** @deprecated No longer throws — use partitionCollectors() instead. Kept for call-site compatibility. */
export function assertNoPendingCollectors(): void {
  // intentionally a no-op: pending collectors are now skipped gracefully via partitionCollectors()
}
