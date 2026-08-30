import { useId, useMemo } from 'react'

import { useThemeTokens } from '../hooks/useThemeTokens'

/**
 * Dependency-free SVG sparkline. Recharts is overkill at 40x16 and this keeps
 * watchlist grids of 30+ cards cheap to render.
 */
export function Sparkline({ data = [], width = 100, height = 32, positive = true }) {
  const tokens = useThemeTokens()
  // Unique id per instance: duplicate gradient ids across cards collide.
  const gradientId = `spark-${useId().replace(/:/g, '')}`
  const path = useMemo(() => {
    const points = data.filter((n) => typeof n === 'number' && !Number.isNaN(n))
    if (points.length < 2) return null

    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const stepX = width / (points.length - 1)
    // Inset by 1px top and bottom so the stroke is never clipped.
    const y = (v) => height - 1 - ((v - min) / span) * (height - 2)

    const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
    const area = `${line} L${width},${height} L0,${height} Z`
    return { line, area }
  }, [data, width, height])

  if (!path) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-text-secondary/60"
        style={{ width, height }}
      >
        no data
      </div>
    )
  }

  const color = positive ? tokens.up : tokens.down

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
