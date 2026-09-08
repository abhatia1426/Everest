const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function fmtMoney(value, { dash = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  return currency.format(value)
}

export function fmtSignedMoney(value, { dash = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${currency.format(Math.abs(value))}`
}

/**
 * Whole-dollar money, for headline figures where cents are noise.
 *
 * Used by the Options band and the contract workspace, where the approved
 * design rounds every summary figure: "$18,412" reads as a magnitude, and
 * "$18,412.37" invites a precision the estimate behind it does not have.
 */
export function fmtMoneyRounded(value, { dash = '—', signed = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`
}

export function fmtPercent(value, { dash = '—', signed = true } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

export function fmtCompact(value, { dash = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toLocaleString('en-US')
}

export function fmtNumber(value, digits = 2, dash = '—') {
  if (value === null || value === undefined || Number.isNaN(value)) return dash
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', opts)
}

export function fmtRelative(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

/** Tailwind text colour for a signed value. Green up, red down, muted flat. */
export function pnlColor(value) {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return 'text-text-secondary'
  }
  return value > 0 ? 'text-up' : 'text-down'
}

export function pnlBg(value) {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return 'bg-tint/[0.03]'
  }
  return value > 0 ? 'bg-up/10' : 'bg-down/10'
}

/** Days-to-expiry badge styling: green > 30d, yellow 8-30d, red <= 7d. */
export function dteTone(dte) {
  if (dte === null || dte === undefined) return 'bg-tint/[0.05] text-text-secondary'
  if (dte <= 7) return 'bg-down/15 text-down'
  if (dte <= 30) return 'bg-warn/15 text-warn'
  return 'bg-up/15 text-up'
}

export const SECTOR_COLORS = [
  '#4f8eff',
  '#00d68f',
  '#a78bfa',
  '#fbbf24',
  '#ff4d6a',
  '#22d3ee',
  '#f472b6',
  '#84cc16',
  '#fb923c',
  '#94a3b8',
]

export function sectorColor(index) {
  return SECTOR_COLORS[index % SECTOR_COLORS.length]
}
