import { parseIndianReportDate } from '../watchdog/fieldMapper.js'

export interface RepairPreview {
  records: unknown[]
  rowCount: number
}

export interface GradeCheck {
  passed: boolean
  score: number
  detail: string
}

export interface RepairGrade {
  score: number
  approved: boolean
  threshold: number
  checks: {
    fieldPresence: GradeCheck
    typeValidity: GradeCheck
    priceBounds: GradeCheck
    rowCountStability: GradeCheck
  }
}

export interface GradeRepairInput {
  expectedFields: string[]
  baselineRowCount: number
  preview: RepairPreview
  threshold?: number
  priceBounds?: { min: number; max: number }
  rowCountTolerance?: number
}

const WEIGHTS = {
  fieldPresence: 0.35,
  typeValidity: 0.25,
  priceBounds: 0.25,
  rowCountStability: 0.15,
} as const

export function gradeRepair(input: GradeRepairInput): RepairGrade {
  const threshold = input.threshold ?? 0.8
  const { records, rowCount } = input.preview

  const fieldPresence = gradeFieldPresence(records, input.expectedFields)
  const typeValidity = gradeTypeValidity(records, input.expectedFields)
  const priceBounds = gradePriceBounds(records, input.priceBounds)
  const rowCountStability = gradeRowCountStability(
    rowCount,
    input.baselineRowCount,
    input.rowCountTolerance ?? 0.2,
  )

  const score = round4(
    fieldPresence.score * WEIGHTS.fieldPresence +
      typeValidity.score * WEIGHTS.typeValidity +
      priceBounds.score * WEIGHTS.priceBounds +
      rowCountStability.score * WEIGHTS.rowCountStability,
  )

  return {
    score,
    approved: score >= threshold,
    threshold,
    checks: { fieldPresence, typeValidity, priceBounds, rowCountStability },
  }
}

function gradeFieldPresence(records: unknown[], expectedFields: string[]): GradeCheck {
  if (records.length === 0) {
    return { passed: false, score: 0, detail: 'No records to check' }
  }

  let passing = 0
  for (const record of records) {
    const ok =
      typeof record === 'object' &&
      record !== null &&
      expectedFields.every((field) => {
        const value = (record as Record<string, unknown>)[field]
        return value !== undefined && value !== null
      })
    if (ok) passing += 1
  }

  const score = passing / records.length
  return {
    passed: score === 1,
    score,
    detail: `${passing}/${records.length} records have all expected fields`,
  }
}

function gradeTypeValidity(records: unknown[], expectedFields: string[]): GradeCheck {
  if (records.length === 0) {
    return { passed: false, score: 0, detail: 'No records to check' }
  }

  let validCells = 0
  let cells = 0
  for (const record of records) {
    if (typeof record !== 'object' || record === null) {
      cells += expectedFields.length
      continue
    }
    const value = record as Record<string, unknown>
    for (const field of expectedFields) {
      cells += 1
      if (isFieldValueValid(field, value[field])) validCells += 1
    }
  }

  const score = cells === 0 ? 0 : validCells / cells
  return {
    passed: score === 1,
    score,
    detail: cells === 0 ? 'No cells to check' : `${validCells}/${cells} cells have valid types`,
  }
}

function isFieldValueValid(field: string, value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (field.endsWith('Price')) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }
  if (field === 'arrivalQty') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  if (field === 'commodity' || field === 'market') {
    return typeof value === 'string' && value.trim().length > 0
  }
  if (field === 'recordedAt') {
    return (typeof value === 'string' && !Number.isNaN(Date.parse(value))) || value instanceof Date
  }
  return true
}

function gradePriceBounds(records: unknown[], bounds?: { min: number; max: number }): GradeCheck {
  if (records.length === 0) {
    return { passed: false, score: 0, detail: 'No records to check' }
  }

  let passing = 0
  for (const record of records) {
    if (typeof record !== 'object' || record === null) continue
    const value = record as Record<string, unknown>
    const minPrice = value.minPrice
    const modalPrice = value.modalPrice
    const maxPrice = value.maxPrice
    if (
      typeof minPrice !== 'number' ||
      typeof modalPrice !== 'number' ||
      typeof maxPrice !== 'number'
    ) {
      continue
    }
    const withinOrder = minPrice <= modalPrice && modalPrice <= maxPrice
    const positive = minPrice > 0 && modalPrice > 0 && maxPrice > 0
    const withinBounds = !bounds || (minPrice >= bounds.min && maxPrice <= bounds.max)
    if (withinOrder && positive && withinBounds) passing += 1
  }

  const score = passing / records.length
  return {
    passed: score === 1,
    score,
    detail: `${passing}/${records.length} records satisfy price bounds`,
  }
}

function gradeRowCountStability(rowCount: number, baseline: number, tolerance: number): GradeCheck {
  if (baseline <= 0) {
    const score = rowCount > 0 ? 1 : 0
    return {
      passed: score === 1,
      score,
      detail: `No baseline rows; ${rowCount > 0 ? 'data present' : 'no rows in preview'}`,
    }
  }

  const drift = Math.abs(rowCount - baseline) / baseline
  const score = round4(Math.max(0, 1 - drift / tolerance))
  return {
    passed: score === 1,
    score,
    detail: `Preview rowCount ${rowCount} vs baseline ${baseline} (${(drift * 100).toFixed(1)}% drift)`,
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

export const BASELINE_MUMBAI_ROW_COUNT = 56
export const GENUINE_HEAL_THRESHOLD = 0.8
const STALE_ARCHIVE_DATE_ISO = '2026-08-03'
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export interface GenuineHealCheck {
  name: string
  passed: boolean
  details: string
}

export interface GenuineHealGradeReport {
  score: number
  threshold: number
  approved: boolean
  hardGateFailed: string | null
  checks: GenuineHealCheck[]
}

export interface GenuineHealGradeInput {
  rows: unknown[]
  staleArchiveDateIso?: string
  baselineRowCount?: number
  priceBounds?: { min: number; max: number }
  now?: Date
}

function unwrapValue(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value
  }
  return v
}

function toNumber(v: unknown): number | null {
  let candidate = unwrapValue(v)
  if (typeof candidate === 'string') candidate = candidate.replace(/[,\s₹]/g, '')
  const parsed = typeof candidate === 'number' ? candidate : Number(candidate)
  return Number.isFinite(parsed) ? parsed : null
}

function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name]
  }
  return undefined
}

function priceFieldsOf(row: Record<string, unknown>): Array<{ field: string; raw: unknown }> {
  return [
    { field: 'min_price', raw: pick(row, 'min_price', 'minPrice') },
    { field: 'avg_price', raw: pick(row, 'avg_price', 'modalPrice') },
    { field: 'max_price', raw: pick(row, 'max_price', 'maxPrice') },
  ]
}

function istDateIso(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export function gradeGenuineHealPreview(
  input: GenuineHealGradeInput,
): GenuineHealGradeReport {
  const rows = input.rows
  const bounds = input.priceBounds ?? { min: 1, max: 100000 }
  const baseline = input.baselineRowCount ?? BASELINE_MUMBAI_ROW_COUNT
  const staleIso = input.staleArchiveDateIso ?? STALE_ARCHIVE_DATE_ISO
  const nowIst = istDateIso(input.now ?? new Date())
  const yesterdayIst = istDateIso(new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000))
  const allowedDates = new Set([nowIst, yesterdayIst])

  const checks: GenuineHealCheck[] = []

  if (rows.length === 0 || typeof rows[0] !== 'object' || rows[0] === null) {
    return {
      score: 0,
      threshold: GENUINE_HEAL_THRESHOLD,
      approved: false,
      hardGateFailed: 'no_rows',
      checks: [
        {
          name: 'field_present',
          passed: false,
          details: `preview_result produced ${rows.length} usable rows - nothing to grade`,
        },
      ],
    }
  }

  let commodityOk = 0
  let modalOk = 0
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const commodity = pick(r, 'commodity_name', 'commodity')
    if (typeof commodity === 'string' && commodity.trim() !== '') commodityOk += 1
    const modalRaw = pick(r, 'avg_price', 'modalPrice')
    if (modalRaw !== undefined && unwrapValue(modalRaw) !== null && modalRaw !== '') modalOk += 1
  }
  checks.push({
    name: 'field_present',
    passed: commodityOk === rows.length && modalOk === rows.length,
    details: `commodity_name present on ${commodityOk}/${rows.length} rows; avg_price/modal equivalent present on ${modalOk}/${rows.length} rows`,
  })

  let typeOk = 0
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const prices = priceFieldsOf(row as Record<string, unknown>)
    if (prices.every(({ raw }) => toNumber(raw) !== null)) typeOk += 1
  }
  checks.push({
    name: 'type_valid',
    passed: typeOk === rows.length,
    details: `${typeOk}/${rows.length} rows have all three price fields parsing as numbers`,
  })

  let boundsOk = 0
  let boundsSeen = 0
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const prices = priceFieldsOf(row as Record<string, unknown>)
    const nums = prices.map(({ raw }) => toNumber(raw))
    if (nums.some((n) => n === null)) continue
    boundsSeen += 1
    if (nums.every((n) => n !== null && n >= bounds.min && n <= bounds.max)) boundsOk += 1
  }
  checks.push({
    name: 'value_in_bounds',
    passed: boundsSeen > 0 && boundsOk === boundsSeen,
    details: `${boundsOk}/${boundsSeen} gradeable rows have all prices within [${bounds.min}, ${bounds.max}]`,
  })

  let datesCurrent = 0
  let datesParsed = 0
  let sawStaleDate = false
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const rawDate = pick(r, 'report_date', 'recordedAt')
    if (rawDate === undefined) continue
    try {
      const parsed = parseIndianReportDate(rawDate)
      datesParsed += 1
      const iso = istDateIso(parsed)
      if (iso === staleIso) sawStaleDate = true
      if (allowedDates.has(iso)) datesCurrent += 1
    } catch {
      // unparseable date counts against the check
    }
  }
  checks.push({
    name: 'date_is_current',
    passed:
      datesParsed > 0 &&
      datesCurrent === datesParsed &&
      !sawStaleDate &&
      datesCurrent === rows.length,
    details: `${datesCurrent}/${rows.length} rows dated today (${nowIst}) or yesterday (${yesterdayIst}) IST${
      sawStaleDate ? `; STALE archive date ${staleIso} detected` : '; no stale archive date detected'
    }`,
  })

  const minRows = Math.floor(baseline * 0.5)
  const maxRows = Math.ceil(baseline * 2)
  checks.push({
    name: 'row_count_stable',
    passed: rows.length >= minRows && rows.length <= maxRows,
    details: `preview has ${rows.length} rows vs baseline ${baseline} (allowed ${minRows}-${maxRows})`,
  })

  const passedCount = checks.filter((c) => c.passed).length
  const score = round4(passedCount / checks.length)
  // date_is_current is a hard gate: a heal that still returns the archived date has
  // not fixed the genuine bug this pipeline exists to demo, regardless of score.
  const dateCheck = checks.find((c) => c.name === 'date_is_current')
  const hardGateFailed = dateCheck && !dateCheck.passed ? 'date_is_current' : null
  return {
    score,
    threshold: GENUINE_HEAL_THRESHOLD,
    approved: score >= GENUINE_HEAL_THRESHOLD && hardGateFailed === null,
    hardGateFailed,
    checks,
  }
}
