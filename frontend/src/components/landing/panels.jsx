import { useId, useMemo } from 'react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { WeightBar } from '../ui/WeightBar'
import { fmtMoney, fmtPercent } from '../../lib/format'

/**
 * Product visualisations for the landing page.
 *
 * BUILT FROM THE REAL PRIMITIVES, not screenshots. Every panel here composes
 * the same `CompanyLogo`, `WeightBar` and design tokens the application uses,
 * so the marketing page cannot visually drift from /app — change a token and
 * both move together. That is the whole reason not to paste an image.
 *
 * WHY NOT IMPORT THE LIVE COMPONENTS: `HoldingsPanel`, `PriceBoard` and the
 * rest depend on `useApi`, `useMode`, `useWatchlist` and an authenticated
 * session. Mounting them on a public page would mean provider scaffolding and
 * failing requests for a visitor who has no account. These are presentational
 * replicas of those layouts using the same building blocks.
 *
 * DATA IS SEEDED AND DETERMINISTIC. It illustrates what the product shows; it
 * is not a claim about anyone's returns, and nothing here is presented as a
 * statistic about Everest or its users.
 */

/* ------------------------------------------------------------ seed data */

export const DEMO_HOLDINGS = [
  { ticker: 'NVDA', name: 'NVIDIA Corporation', value: 43222, weight: 24.1, change: 1.65, sector: 'Semiconductors' },
  { ticker: 'AAPL', name: 'Apple Inc.', value: 37599, weight: 21.0, change: 0.29, sector: 'Technology' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', value: 32499, weight: 18.1, change: 0.51, sector: 'Technology' },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.', value: 21981, weight: 12.3, change: -0.74, sector: 'Retail' },
  { ticker: 'LLY', name: 'Eli Lilly and Company', value: 26085, weight: 14.6, change: 1.12, sector: 'Pharmaceuticals' },
]

export const DEMO_WATCHLIST = [
  { ticker: 'TSLA', name: 'Tesla, Inc.', price: 328.58, change: 2.68, sector: 'Automobiles' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', price: 355.01, change: -0.77, sector: 'Media' },
  { ticker: 'META', name: 'Meta Platforms, Inc.', price: 592.49, change: 0.44, sector: 'Media' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', price: 479.84, change: -1.93, sector: 'Semiconductors' },
]

export const SECTORS = [
  { name: 'Technology', weight: 39.1, color: 'var(--chart-1)' },
  { name: 'Semiconductors', weight: 24.1, color: 'var(--chart-2)' },
  { name: 'Pharmaceuticals', weight: 14.6, color: 'var(--chart-3)' },
  { name: 'Retail', weight: 12.3, color: 'var(--chart-4)' },
  { name: 'Energy', weight: 9.9, color: 'var(--chart-5)' },
]

/**
 * Deterministic pseudo-random series.
 *
 * Seeded so every render — and every visitor — sees the same chart. A
 * `Math.random()` series would flicker on re-render and, worse, imply the page
 * is showing live data when it is not.
 */
export function series(seed, points, drift = 0.55, volatility = 1) {
  const out = []
  let value = 100
  let state = seed
  for (let i = 0; i < points; i += 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    const noise = (state / 2147483648 - 0.5) * 6 * volatility
    value += drift + noise
    out.push(value)
  }
  return out
}

/* ---------------------------------------------------------------- chart */

/** Area chart. Pure SVG — no charting library on the marketing bundle. */
export function DemoAreaChart({ seed = 7, points = 64, height = 150, positive = true, className = '' }) {
  const gradientId = useId().replace(/:/g, '')
  const data = useMemo(() => series(seed, points), [seed, points])

  const width = 600
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)

  const coords = data.map((v, i) => [i * step, height - ((v - min) / span) * (height - 14) - 7])
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const stroke = positive ? 'var(--accent-green)' : 'var(--accent-red)'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${gradientId}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId}-f)`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="3" fill={stroke} />
    </svg>
  )
}

/** Compact sparkline for watchlist tiles. */
function DemoSparkline({ seed, positive, width = 200, height = 34 }) {
  const data = useMemo(() => series(seed, 28, positive ? 0.5 : -0.5, 1.4), [seed, positive])
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const line = data
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 6) - 3).toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={line}
        fill="none"
        stroke={positive ? 'var(--accent-green)' : 'var(--accent-red)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* --------------------------------------------------------------- shell */

/**
 * The window frame every panel sits in.
 *
 * Deliberately restrained: a hairline border, the app's own card radius, and a
 * single label row. No browser chrome, no traffic lights — those read as a
 * screenshot of a website, and the goal is for these to read as the product
 * itself embedded in the composition.
 */
export function PanelFrame({ label, children, className = '', style }) {
  return (
    <div
      className={`overflow-hidden rounded-card ${className}`}
      style={{
        background: 'var(--e2-bg)',
        border: '1px solid var(--e2-border)',
        boxShadow: 'var(--shadow-e3)',
        ...style,
      }}
    >
      {label ? (
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="t-eyebrow">{label}</span>
        </div>
      ) : null}
      {children}
    </div>
  )
}

/* --------------------------------------------------------------- panels */

/** Portfolio: the value, the trend, the holdings. The hero's centrepiece. */
export function PortfolioPanel({ compact = false }) {
  return (
    <PanelFrame label="Portfolio">
      <div className="px-5 pb-4 pt-5">
        <p className="t-eyebrow">Total portfolio value</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <span className="num-hero text-[clamp(1.75rem,3.6vw,2.5rem)] text-text-primary">
            $179,386.40
          </span>
          <span className="num text-[13px] font-bold text-up">+$2,407.02 +1.36%</span>
        </div>
      </div>

      <div className="px-2">
        <DemoAreaChart seed={11} height={compact ? 108 : 150} />
      </div>

      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        {DEMO_HOLDINGS.slice(0, compact ? 3 : 4).map((h) => (
          <div key={h.ticker} className="flex items-center gap-3 px-5 py-2.5">
            <CompanyLogo ticker={h.ticker} name={h.name} size={26} />
            <div className="min-w-0 flex-1">
              <p className="num text-[12px] font-semibold text-text-primary">{h.ticker}</p>
              <p className="truncate text-[10.5px] text-text-tertiary">{h.sector}</p>
            </div>
            <div className="w-20 shrink-0">
              <WeightBar value={h.weight} height={2} />
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-[12px] font-semibold text-text-primary">
                {fmtMoney(h.value)}
              </p>
              <p className={`num text-[10.5px] font-semibold ${h.change >= 0 ? 'text-up' : 'text-down'}`}>
                {fmtPercent(h.change)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </PanelFrame>
  )
}

/** Allocation: composition at a glance. */
export function AllocationPanel() {
  return (
    <PanelFrame label="Allocation">
      <div className="px-5 py-5">
        <div className="flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
          {SECTORS.map((s) => (
            <span key={s.name} style={{ width: `${s.weight}%`, background: s.color }} />
          ))}
        </div>
        <ul className="mt-4 space-y-2.5">
          {SECTORS.map((s) => (
            <li key={s.name} className="flex items-center gap-2.5 text-[11.5px]">
              <span
                className="h-2 w-2 shrink-0 rounded-[3px]"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-text-secondary">{s.name}</span>
              <span className="num font-semibold text-text-primary">{s.weight.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  )
}

/** Watchlist: what you are following, and what moved. */
export function WatchlistPanel() {
  return (
    <PanelFrame label="Watchlist">
      {/*
        Responsive CLASSES, not an inline grid-template. An inline style cannot
        carry a media query, so a fixed two-column board would stay two columns
        at 390px and crush each tile.
      */}
      <div
        className="grid grid-cols-1 gap-px sm:grid-cols-2"
        style={{ background: 'var(--border)' }}
      >
        {DEMO_WATCHLIST.map((w) => (
          <div key={w.ticker} className="p-3.5" style={{ background: 'var(--e2-bg)' }}>
            <div className="flex items-center gap-2.5">
              <CompanyLogo ticker={w.ticker} name={w.name} size={24} />
              <div className="min-w-0">
                <p className="num text-[12px] font-semibold text-text-primary">{w.ticker}</p>
                <p className="truncate text-[10px] text-text-tertiary">{w.sector}</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="num text-[15px] font-semibold text-text-primary">
                {fmtMoney(w.price)}
              </span>
              <span className={`num text-[11px] font-bold ${w.change >= 0 ? 'text-up' : 'text-down'}`}>
                {fmtPercent(w.change)}
              </span>
            </div>
            <div className="-mx-1 mt-2">
              <DemoSparkline seed={w.ticker.charCodeAt(0) * 37} positive={w.change >= 0} />
            </div>
          </div>
        ))}
      </div>
    </PanelFrame>
  )
}

/** Stock detail: identity, price, history, fundamentals. */
export function TickerPanel() {
  return (
    <PanelFrame label="Research">
      <div className="flex items-start gap-3 px-5 pb-3 pt-4">
        <CompanyLogo ticker="AAPL" name="Apple Inc." size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-text-primary">Apple Inc.</p>
          <p className="text-[10.5px] text-text-tertiary">NASDAQ · Technology · Consumer Electronics</p>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-2.5 px-5 pb-3">
        <span className="num-hero text-[26px] text-text-primary">$313.33</span>
        <span className="num text-[12px] font-bold text-up">+$0.92 +0.29%</span>
      </div>

      <div className="px-2">
        <DemoAreaChart seed={29} height={132} />
      </div>

      <div
        className="grid grid-cols-4 gap-x-4 border-t px-5 py-3.5"
        style={{ borderColor: 'var(--border)' }}
      >
        {[
          ['Market cap', '4.56T'],
          ['P/E', '35.43'],
          ['EPS', '8.72'],
          ['Beta', '1.08'],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="t-eyebrow">{k}</p>
            <p className="num mt-1 text-[12px] font-semibold text-text-primary">{v}</p>
          </div>
        ))}
      </div>
    </PanelFrame>
  )
}

/** Options: strike, expiry, breakeven, capital at risk. */
export function OptionsPanel() {
  // Spot 313.33 against a 300 strike: in the money, breakeven at 308.20.
  const spot = 62
  const breakeven = 47

  return (
    <PanelFrame label="Options">
      <div className="px-5 pb-4 pt-4">
        <div className="flex items-center gap-2.5">
          <CompanyLogo ticker="AAPL" name="Apple Inc." size={26} />
          <span className="num text-[12.5px] font-semibold text-text-primary">AAPL</span>
          <span className="rounded bg-up/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-up">
            call
          </span>
          <span className="rounded bg-up/12 px-1.5 py-0.5 text-[10px] font-bold text-up">ITM</span>
          <span className="num ml-auto text-[10.5px] text-text-tertiary">$300 · Sep 18</span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="t-eyebrow">Est. value</p>
            <p className="num-hero mt-1 text-[22px] text-text-primary">$4,180.00</p>
          </div>
          <div className="text-right">
            <p className="num text-[12.5px] font-bold text-up">+$1,660.00</p>
            <p className="num text-[10.5px] font-semibold text-up">+65.87%</p>
          </div>
        </div>

        {/* The strike meter — spot, strike and breakeven on one axis. */}
        <div className="mt-4">
          <p className="t-eyebrow mb-2">Strike position</p>
          <div className="relative h-6 overflow-hidden rounded-panel" style={{ background: 'var(--e0-bg)' }}>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 right-0"
              style={{ left: '50%', background: 'rgb(var(--accent-green-rgb) / 0.08)' }}
            />
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
              style={{ background: 'var(--border-strong)' }}
            />
            <span
              aria-hidden="true"
              className="absolute inset-y-1 w-px -translate-x-1/2"
              style={{
                left: `${breakeven}%`,
                background:
                  'repeating-linear-gradient(180deg, var(--text-tertiary) 0 3px, transparent 3px 6px)',
              }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${spot}%`, boxShadow: '0 0 0 3px var(--e2-bg)' }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-text-tertiary">
            <span className="num">strike $300.00</span>
            <span className="num">breakeven $308.20</span>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-3 border-t px-5 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {[
          ['Expires', '42d'],
          ['At risk', '$2,520'],
          ['To breakeven', 'passed'],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="t-eyebrow">{k}</p>
            <p className="num mt-1 text-[11.5px] font-semibold text-text-primary">{v}</p>
          </div>
        ))}
      </div>
    </PanelFrame>
  )
}

/**
 * AI workspace.
 *
 * Copy chosen carefully: the panel shows the model REPORTING measured facts
 * about the book and naming what it cannot know. That is the honest positioning
 * — the product interprets your data, it does not forecast the market.
 */
export function IntelligencePanel() {
  return (
    <PanelFrame label="Portfolio Analyst">
      <div className="px-5 py-5">
        <div className="flex flex-wrap gap-1.5">
          {['Portfolio Analyst', 'Risk', 'Compare', 'Thesis'].map((t, i) => (
            <span
              key={t}
              className={`rounded-control px-2 py-1 text-[10.5px] font-semibold ${
                i === 0 ? 'bg-accent/12 text-accent' : 'text-text-tertiary'
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-4 space-y-3.5">
          {[
            {
              tone: 'var(--accent-amber)',
              label: 'Concentration',
              text: 'Technology and semiconductors account for 63.2% of the book. A single-sector drawdown would drive most of the volatility.',
            },
            {
              tone: 'var(--accent-green)',
              label: 'Contribution',
              text: 'NVDA has produced 41% of unrealized gains while holding 24.1% of capital.',
            },
            {
              tone: 'var(--accent-blue)',
              label: 'Coverage',
              text: 'Two holdings have no live quote this session and are valued at cost basis.',
            },
          ].map((row) => (
            <div key={row.label} className="border-l-2 pl-3.5" style={{ borderColor: row.tone }}>
              <p className="t-eyebrow">{row.label}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{row.text}</p>
            </div>
          ))}
        </div>

        <p
          className="mt-4 border-t pt-3 text-[10.5px] leading-relaxed text-text-tertiary"
          style={{ borderColor: 'var(--border)' }}
        >
          Measured from your holdings. Everest states what it cannot determine rather than
          estimating it.
        </p>
      </div>
    </PanelFrame>
  )
}

/** Market strip — the thin context bar used across the product. */
export function MarketStrip({ className = '' }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card px-5 py-3 ${className}`}
      style={{ background: 'var(--e2-bg)', border: '1px solid var(--e2-border)' }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-up">
        <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
        Market open
      </span>
      {[
        ['S&P 500', '773.26', 0.61],
        ['Nasdaq 100', '723.03', 1.17],
        ['Dow 30', '539.62', 0.27],
      ].map(([name, value, change]) => (
        <span key={name} className="flex items-baseline gap-2 text-[11px]">
          <span className="text-text-secondary">{name}</span>
          <span className="num font-semibold text-text-primary">{value}</span>
          <span className="num font-bold text-up">{fmtPercent(change)}</span>
        </span>
      ))}
    </div>
  )
}
