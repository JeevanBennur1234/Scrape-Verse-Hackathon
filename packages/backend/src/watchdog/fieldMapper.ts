import type { CollectorKey } from '../collectors/mandi-registry.js'

export interface PriceTickInput {
  commodity: string
  market: string
  modalPrice: number
  minPrice: number
  maxPrice: number
  arrivalQty: number
  recordedAt: Date
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९'

function normalizeDigits(input: string): string {
  let output = ''
  for (const char of input) {
    const devanagariIndex = DEVANAGARI_DIGITS.indexOf(char)
    output += devanagariIndex === -1 ? char : String(devanagariIndex)
  }
  return output
}

const MARATHI_MONTHS: Record<string, number> = {
  जाने: 1,
  फेब्रु: 2,
  मार्च: 3,
  एप्रि: 4,
  मे: 5,
  जून: 6,
  जुलै: 7,
  ऑग: 8,
  सप्टें: 9,
  ऑक्टो: 10,
  नोव्हें: 11,
  डिसें: 12,
}

function marathiMonthToNumber(token: string): number | undefined {
  const cleaned = token.replace(/[.,।]/g, '').trim()
  for (const [prefix, month] of Object.entries(MARATHI_MONTHS)) {
    if (cleaned.startsWith(prefix) || prefix.startsWith(cleaned)) {
      return month
    }
  }
  return undefined
}

function istMidnight(year: number, month: number, day: number): Date {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00+05:30`)
}

function assertValidDayMonth(day: number, month: number, source: string): void {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date components in "${source}" (day=${day}, month=${month})`)
  }
}

export function parseIndianReportDate(raw: unknown): Date {
  if (raw instanceof Date) return raw
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('report_date is missing or not a string')
  }
  const text = normalizeDigits(raw.trim())

  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    assertValidDayMonth(day, month, text)
    return istMidnight(year, month, day)
  }

  const dmyMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    assertValidDayMonth(day, month, text)
    return istMidnight(year, month, day)
  }

  const marathiMatch = text.match(/(\d{1,2})\s*([^\s\d,]+)[.।]?\s*,?\s*(\d{4})/)
  if (marathiMatch) {
    const day = Number(marathiMatch[1])
    const month = marathiMonthToNumber(marathiMatch[2] ?? '')
    const year = Number(marathiMatch[3])
    if (month !== undefined) {
      assertValidDayMonth(day, month, text)
      return istMidnight(year, month, day)
    }
  }

  throw new Error(
    `Unrecognized report_date format: "${raw}". Expected DD/MM/YYYY, YYYY-MM-DD, or Marathi form like "बाजारभाव - ( सोमवार, 03 ऑग., 2026 )"`,
  )
}

function coerceNumber(field: string, value: unknown): number {
  let candidate = value
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'value' in (candidate as Record<string, unknown>)
  ) {
    candidate = (candidate as Record<string, unknown>).value
  }
  if (typeof candidate === 'string') {
    candidate = candidate.replace(/[,\s₹]/g, '')
  }
  const parsed = typeof candidate === 'number' ? candidate : Number(candidate)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Field "${field}" is not a finite number (got: ${JSON.stringify(value)})`)
  }
  return parsed
}

function requireString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Field "${field}" is missing or empty`)
  }
  return value.trim()
}

export function normalizeMumbaiRow(raw: unknown): PriceTickInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Mumbai row is not an object')
  }
  const row = raw as Record<string, unknown>
  return {
    commodity: requireString('commodity', row.commodity),
    market: requireString('market', row.market),
    modalPrice: coerceNumber('modal_price', row.modal_price),
    minPrice: coerceNumber('min_price', row.min_price),
    maxPrice: coerceNumber('max_price', row.max_price),
    arrivalQty: Math.round(coerceNumber('arrival_qty', row.arrival_qty ?? 0)),
    recordedAt: parseIndianReportDate(row.report_date),
  }
}

export function normalizeMsambRow(raw: unknown): PriceTickInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Bangalore row is not an object')
  }
  const row = raw as Record<string, unknown>
  return {
    commodity: requireString('commodity', row.commodity),
    market: requireString('market', row.market),
    modalPrice: coerceNumber('modal_price', row.modal_price),
    minPrice: coerceNumber('min_price', row.min_price),
    maxPrice: coerceNumber('max_price', row.max_price),
    arrivalQty: Math.round(coerceNumber('arrival_qty', row.arrival_qty ?? 0)),
    recordedAt: parseIndianReportDate(row.report_date),
  }
}

const MAPPERS: Record<CollectorKey, (raw: unknown) => PriceTickInput> = {
  mumbai_apmc: normalizeMumbaiRow,
  msamb: normalizeMsambRow,
}

export function normalize(collectorKey: CollectorKey, rawRow: unknown): PriceTickInput {
  const mapper = MAPPERS[collectorKey]
  if (!mapper) {
    throw new Error(`No field mapper registered for collector key "${collectorKey}"`)
  }
  return mapper(rawRow)
}

export function expandRows(collectorKey: CollectorKey, rawRecord: unknown): unknown[] {
  if (
    collectorKey === 'mumbai_apmc' &&
    typeof rawRecord === 'object' &&
    rawRecord !== null &&
    Array.isArray((rawRecord as Record<string, unknown>).vegetables)
  ) {
    const page = rawRecord as Record<string, unknown>
    const reportDate = page.report_date
    return (page.vegetables as unknown[]).map((vegetable) => ({
      ...(typeof vegetable === 'object' && vegetable !== null ? vegetable : {}),
      report_date: reportDate,
    }))
  }
  return [rawRecord]
}
