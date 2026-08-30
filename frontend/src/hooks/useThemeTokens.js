import { useEffect, useState } from 'react'

import { useTheme } from './useTheme'

/**
 * Reads the current theme's colours out of CSS custom properties as plain
 * strings.
 *
 * Charting libraries (Recharts, lightweight-charts) take colours as JS values
 * and cannot resolve `var(--x)`, so they would otherwise be stuck with
 * hardcoded dark-mode hex. Re-reading on every theme change keeps them in sync.
 */
function read() {
  if (typeof window === 'undefined') {
    return {
      accent: '#4f8eff',
      up: '#00d68f',
      down: '#ff4d6a',
      textPrimary: '#f0f0f5',
      textSecondary: '#7a7a9a',
      card: '#13151d',
      base: '#08090e',
      border: 'rgba(255,255,255,0.07)',
      gridLine: 'rgba(255,255,255,0.055)',
      chart: ['#5b8cff', '#1fcf8b', '#a78bfa', '#ffb443', '#ff5470', '#38bdf8', '#f472b6', '#a3e635'],
    }
  }

  const styles = getComputedStyle(document.documentElement)
  const value = (name, fallback) => styles.getPropertyValue(name).trim() || fallback

  return {
    accent: value('--accent-blue', '#4f8eff'),
    up: value('--accent-green', '#00d68f'),
    down: value('--accent-red', '#ff4d6a'),
    textPrimary: value('--text-primary', '#f0f0f5'),
    textSecondary: value('--text-secondary', '#7a7a9a'),
    card: value('--bg-card', '#13151d'),
    base: value('--bg-base', '#08090e'),
    border: value('--border', 'rgba(255,255,255,0.07)'),
    gridLine: value('--grid-line', 'rgba(255,255,255,0.055)'),
    // Categorical scale for allocation and multi-series charts. Read as an
    // array so callers index by position rather than naming a slot.
    chart: Array.from({ length: 8 }, (_, i) => value(`--chart-${i + 1}`, '#5b8cff')),
  }
}

/** Convert a #rrggbb token to rgba(). Charting libs need a concrete colour. */
export function alpha(color, a) {
  const hex = String(color).trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function useThemeTokens() {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState(read)

  useEffect(() => {
    // The theme attribute is written in a layout effect upstream; read after
    // paint so the new custom property values are the ones we pick up.
    const frame = requestAnimationFrame(() => setTokens(read()))
    return () => cancelAnimationFrame(frame)
  }, [theme])

  return tokens
}
