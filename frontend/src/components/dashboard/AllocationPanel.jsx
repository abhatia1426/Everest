import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import { EmptyState } from '../States'
import { Panel } from '../ui/Surface'
import { WeightBar } from '../ui/WeightBar'
import { useThemeTokens } from '../../hooks/useThemeTokens'
import { fmtMoney } from '../../lib/format'

/**
 * Sector allocation.
 *
 * The donut answers "am I balanced" at a glance; the ranked bars beneath answer
 * "in what, and how much". v2 showed a colour dot and a bare percentage, which
 * made the reader mentally sort ten numbers — the bar does that sorting
 * pre-attentively, and the dollar value is restored so the panel is useful
 * without cross-referencing the command bar.
 */
export function AllocationPanel({ allocation = [], loading }) {
  const tokens = useThemeTokens()

  const { slices, total } = useMemo(() => {
    const sum = allocation.reduce((acc, slice) => acc + slice.value, 0)
    const sorted = [...allocation].sort((a, b) => b.value - a.value)
    return { slices: sorted, total: sum }
  }, [allocation])

  const palette = tokens.chart || []
  const colorAt = (index) => palette[index % palette.length] || 'var(--accent-blue)'

  return (
    <Panel title="Allocation">
      {loading ? (
        <div className="flex flex-col items-center">
          <div
            className="h-[150px] w-[150px] rounded-full"
            style={{ border: '18px solid var(--e0-bg)' }}
            aria-hidden="true"
          />
          <div className="mt-5 w-full space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-6 w-full" />
            ))}
          </div>
        </div>
      ) : slices.length === 0 ? (
        <EmptyState
          title="Nothing allocated"
          description="Your sector mix appears once you hold positions."
        />
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="sector"
                  innerRadius={58}
                  outerRadius={80}
                  // A padding angle on a lone 100% slice subtracts from the
                  // only arc there is, so the ring renders as a stub.
                  paddingAngle={slices.length > 1 ? 1.5 : 0}
                  stroke="none"
                  animationDuration={450}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.sector} fill={colorAt(index)} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="t-eyebrow">Invested</p>
                <p className="num mt-1 text-[15px] font-bold text-text-primary">
                  {fmtMoney(total)}
                </p>
              </div>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {slices.slice(0, 6).map((slice, index) => {
              const weight = total ? (slice.value / total) * 100 : 0

              return (
                <li key={slice.sector}>
                  <div className="mb-1.5 flex items-baseline gap-2 text-[11px]">
                    <span className="flex-1 truncate font-medium text-text-secondary">
                      {slice.sector}
                    </span>
                    <span className="num font-semibold text-text-primary">
                      {weight.toFixed(1)}%
                    </span>
                    <span className="num w-16 text-right text-text-tertiary">
                      {fmtMoney(slice.value)}
                    </span>
                  </div>
                  <WeightBar value={weight} color={colorAt(index)} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
