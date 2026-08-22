import { useState } from 'react'

export interface GradeCheckInfo {
  passed: boolean
  score: number
  detail: string
}

export type RepairChecks =
  | {
      fieldPresence: GradeCheckInfo
      typeValidity: GradeCheckInfo
      priceBounds: GradeCheckInfo
      rowCountStability: GradeCheckInfo
    }
  | Array<{ name: string; passed: boolean; details?: string; score?: number }>

const CHECK_LABELS: Record<string, string> = {
  fieldPresence: 'field presence',
  field_present: 'field present',
  typeValidity: 'type validity',
  type_valid: 'type valid',
  priceBounds: 'price bounds',
  value_in_bounds: 'value in bounds',
  date_is_current: 'date is current',
  rowCountStability: 'row count',
  row_count_stable: 'row count stable',
}

function normalizeChecks(
  checks: RepairChecks | null | undefined,
): Array<{ key: string; label: string; info: GradeCheckInfo }> {
  if (!checks) return []
  if (Array.isArray(checks)) {
    return checks.map((check) => ({
      key: check.name,
      label: CHECK_LABELS[check.name] ?? check.name,
      info: {
        passed: check.passed,
        score: check.score ?? (check.passed ? 1 : 0),
        detail: check.details ?? '',
      },
    }))
  }
  return Object.entries(checks).map(([key, info]) => ({
    key,
    label: CHECK_LABELS[key] ?? key,
    info,
  }))
}

interface GradeBadgeProps {
  score: number
  checks?: RepairChecks | null
  className?: string
}

export function GradeBadge({ score, checks, className }: GradeBadgeProps) {
  const [open, setOpen] = useState(false)
  const passed = score >= 0.8
  const normalized = normalizeChecks(checks)

  return (
    <span
      className={`relative inline-flex flex-col items-start ${className ?? ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
          passed
            ? 'border-green-500/40 bg-green-500/15 text-green-400'
            : 'border-red-500/40 bg-red-500/15 text-red-400'
        }`}
      >
        {score.toFixed(2)}
        <span>{passed ? '✓' : '✗'}</span>
      </span>
      {open && normalized.length > 0 && (
        <span className="mt-1 w-64 space-y-1 rounded-md border border-border bg-popover p-2 font-mono text-[10px] leading-snug text-popover-foreground shadow-lg">
          {normalized.map(({ key, label, info }) => (
            <span key={key} className="block">
              <span className={info.passed ? 'text-green-500' : 'text-red-500'}>
                {info.passed ? '✓' : '✗'}
              </span>{' '}
              {label} <span className="tabular-nums">{info.score.toFixed(2)}</span>
              <span className="block pl-3 text-muted-foreground">{info.detail}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
