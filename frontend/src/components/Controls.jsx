import { useMode } from '../hooks/useMode'

export const TIME_RANGES = ['1H', '1D', '1W', '1M', '3M', '6M', '1Y', 'ALL']

export function apiPeriod(label) {
  return label.toLowerCase()
}

/** Segmented pill group. Used for time ranges, chart type and any 2-8 option switch. */
export function PillGroup({ options, value, onChange, label, size = 'sm' }) {
  const pad = size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="surface-1 inline-flex items-center gap-0.5 !rounded-full p-1"
    >
      {options.map((option) => {
        const optValue = typeof option === 'string' ? option : option.value
        const optLabel = typeof option === 'string' ? option : option.label
        const active = optValue === value

        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(optValue)}
            style={
              active
                ? {
                    background:
                      'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
                  }
                : undefined
            }
            className={`cursor-pointer select-none rounded-full font-semibold transition-all duration-200 ${pad} ${
              active
                ? 'text-white shadow-[0_2px_10px_-2px_rgb(var(--accent-blue-rgb)/0.7)]'
                : 'text-text-secondary hover:bg-tint/[0.06] hover:text-text-primary'
            }`}
          >
            {optLabel}
          </button>
        )
      })}
    </div>
  )
}

/** Real vs Paper toggle, wired straight into the shared mode context. */
export function ModeToggle({ size = 'sm' }) {
  const { mode, setMode } = useMode()

  return (
    <PillGroup
      label="Trading mode"
      size={size}
      value={mode}
      onChange={setMode}
      options={[
        { value: 'real', label: 'Real' },
        { value: 'paper', label: 'Paper' },
      ]}
    />
  )
}

export function ModeBadge() {
  const { mode } = useMode()
  const paper = mode === 'paper'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold
        uppercase tracking-wider ${
          paper ? 'bg-warn/12 text-warn' : 'bg-accent/12 text-accent'
        }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${paper ? 'bg-warn' : 'bg-accent'}`} />
      {paper ? 'Paper' : 'Real'}
    </span>
  )
}

export function SentimentBadge({ sentiment }) {
  const tone =
    sentiment === 'positive'
      ? { dot: 'bg-up', text: 'text-up', bg: 'bg-up/10', label: 'Positive' }
      : sentiment === 'negative'
        ? { dot: 'bg-down', text: 'text-down', bg: 'bg-down/10', label: 'Negative' }
        : { dot: 'bg-text-secondary', text: 'text-text-secondary', bg: 'bg-tint/[0.04]', label: 'Neutral' }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  )
}

export function SectorBadge({ sector }) {
  if (!sector || sector === 'Unknown') return null
  return (
    <span className="rounded-md bg-tint/[0.05] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
      {sector}
    </span>
  )
}
