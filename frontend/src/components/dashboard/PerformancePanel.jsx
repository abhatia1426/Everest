import { useCallback, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState, ErrorState, Skeleton } from '../States'
import { Panel } from '../ui/Surface'
import { Segmented, ToggleChip } from '../ui/Segmented'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { useThemeTokens } from '../../hooks/useThemeTokens'
import { api } from '../../lib/api'
import { fmtPercent } from '../../lib/format'

const RANGES = ['1W', '1M', '3M', '6M', '1Y', 'ALL']
const BENCHMARK = 'SPY'
const CHART_HEIGHT = 292

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="rounded-panel px-3 py-2 text-xs"
      style={{
        background: 'var(--e3-bg)',
        border: '1px solid var(--e3-border)',
        boxShadow: 'var(--shadow-e3)',
      }}
    >
      {label ? <p className="mb-1.5 text-[11px] text-text-secondary">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.dataKey} className="num flex items-center gap-2 font-semibold">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: entry.color }}
            aria-hidden="true"
          />
          <span className="text-text-secondary">
            {entry.dataKey === 'benchmark' ? BENCHMARK : 'Portfolio'}
          </span>
          <span className="text-text-primary">{fmtPercent(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * Portfolio performance.
 *
 * Indexed to 0% at the range start rather than plotted in dollars, so the
 * portfolio and an ETF are comparable on one axis regardless of absolute size —
 * that is the only way the vs-SPY overlay means anything.
 */
export function PerformancePanel({ mode }) {
  const [range, setRange] = useState('1M')
  const [showBenchmark, setShowBenchmark] = useState(false)
  const tokens = useThemeTokens()

  const period = range.toLowerCase()
  const fetcher = useCallback(() => api.portfolioHistory(mode, period), [mode, period])
  const { data, loading, error, refetch } = useApi(fetcher, [mode, period], { key: `pfhist:${mode}:${period}`, ttl: TTL.HISTORY })

  // Benchmark is opt-in so we never spend a request on it unless asked.
  const benchFetcher = useCallback(() => api.history(BENCHMARK, period), [period])
  const { data: benchData } = useApi(benchFetcher, [period], { key: `history:${BENCHMARK}:${period}`, ttl: TTL.HISTORY, enabled: showBenchmark })

  const series = useMemo(() => {
    const points = data?.series || []
    if (points.length < 2) return []

    const base = points[0].value || 1
    const benchCandles = benchData?.candles || []
    const benchBase = benchCandles[0]?.close || null

    return points.map((point, index) => {
      const bench = benchBase ? benchCandles[Math.min(index, benchCandles.length - 1)] : null
      return {
        label: new Date(point.time).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        value: point.value,
        portfolio: ((point.value - base) / base) * 100,
        benchmark: bench && benchBase ? ((bench.close - benchBase) / benchBase) * 100 : null,
      }
    })
  }, [data, benchData])

  const positive = series.length > 1 ? series[series.length - 1].value >= series[0].value : true
  const color = positive ? tokens.up : tokens.down
  const benchmarkAvailable = (benchData?.candles || []).length > 1

  const totalReturn = series.length > 1 ? series[series.length - 1].portfolio : null

  return (
    <Panel
      title="Performance"
      action={
        <div className="flex items-center gap-2">
          <ToggleChip active={showBenchmark} onClick={() => setShowBenchmark((v) => !v)}>
            vs {BENCHMARK}
          </ToggleChip>
          <Segmented label="Chart range" options={RANGES} value={range} onChange={setRange} size="sm" />
        </div>
      }
    >
      {/*
        The range's own return, stated once above the plot. Without it the user
        has to read the last point off the axis to answer the question the
        chart exists to answer.
      */}
      {series.length > 1 ? (
        <p className="num mb-3 text-[13px] font-semibold">
          <span className={positive ? 'text-up' : 'text-down'}>{fmtPercent(totalReturn)}</span>
          <span className="ml-2 font-medium text-text-tertiary">over {range}</span>
        </p>
      ) : null}

      <div style={{ minHeight: CHART_HEIGHT }}>
        {loading && !data ? (
          <Skeleton className="w-full rounded-panel" style={{ height: CHART_HEIGHT }} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : series.length < 2 ? (
          <EmptyState
            title="Not enough history yet"
            description="Once your holdings have priced history, performance plots here."
          />
        ) : (
          <>
            {showBenchmark && !benchmarkAvailable ? (
              <p className="mb-2 text-[11px] text-text-secondary">
                {BENCHMARK} history is unavailable right now — showing your portfolio only.
              </p>
            ) : null}

            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={series} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* Horizontal rules only: vertical grid on a time axis adds
                    ink without adding readable information. */}
                <CartesianGrid
                  vertical={false}
                  stroke={tokens.gridLine || 'rgba(128,128,128,0.08)'}
                  strokeDasharray="0"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: tokens.textSecondary, fontSize: 10.5 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={44}
                />
                <YAxis
                  tick={{ fill: tokens.textSecondary, fontSize: 10.5 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: tokens.textSecondary, strokeOpacity: 0.3, strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke={color}
                  strokeWidth={1.75}
                  fill="url(#perf-fill)"
                  animationDuration={450}
                />
                {showBenchmark && benchmarkAvailable ? (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke={tokens.textSecondary}
                    strokeWidth={1.25}
                    strokeDasharray="3 3"
                    dot={false}
                    animationDuration={450}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </Panel>
  )
}
