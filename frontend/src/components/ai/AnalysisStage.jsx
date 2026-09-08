import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Copy, Info, Plus, RefreshCw } from 'lucide-react'

import { Surface } from '../ui/Surface'
import { ToolReport } from './Reports'

/**
 * The generated half of the route — and the only part of it that can fail.
 *
 * EDITORIAL, NOT CONVERSATIONAL. There is no chat bubble, no avatar, no
 * typewriter effect. A typewriter in particular would be a lie about latency:
 * the backend returns one complete JSON document, so revealing it character by
 * character would stage a "thinking" performance that never happened.
 *
 * THE SEPARATION IS STRUCTURAL. The measured strip and the Grounded-in block
 * are rendered from the user's own figures and are visually distinct from the
 * model's prose, which is confined to `ToolReport`. Nothing in this file mixes
 * a generated sentence into a measured row.
 */
export function AnalysisStage({
  state,
  question,
  tool,
  result,
  error,
  measured,
  grounding,
  limitations,
  provider,
  onRetry,
  onCopy,
  copied,
}) {
  const title =
    state === 'answer' ? 'Analysis' : state === 'working' ? 'Working' : 'Analysis unavailable'

  return (
    <Surface as="section" className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-subtle px-4 py-3.5 sm:px-5">
        <h2 className="t-eyebrow">{state === 'idle' ? 'Analysis' : title}</h2>
        {state === 'answer' ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onCopy} className="btn-ghost px-2.5 py-1.5 text-[11px]">
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={onRetry} className="btn-ghost px-2.5 py-1.5 text-[11px]">
              <RefreshCw size={11} />
              Regenerate
            </button>
          </div>
        ) : null}
      </header>

      {state === 'idle' ? <Idle tool={tool} /> : null}
      {state === 'working' ? <Working tool={tool} grounding={grounding} /> : null}
      {state === 'error' ? (
        <Notice error={error} provider={provider} onRetry={onRetry} tool={tool} />
      ) : null}

      {state === 'answer' ? (
        <div className="animate-fade-in px-4 py-4 sm:px-5">
          <p
            className="mb-3 cursor-help text-[11px] text-text-tertiary"
            title={`Answered by the ${tool.registryName} tool. Reads: ${tool.uses}`}
          >
            “{question}” · {tool.name}
          </p>

          {/* ---- MEASURED. Not from the model. --------------------- */}
          {measured?.length ? (
            <dl className="grid grid-cols-2 gap-3 border-y border-subtle py-3 sm:grid-cols-4">
              {measured.map((stat) => (
                <div key={stat.label}>
                  <dt className="t-eyebrow !text-[9.5px] !text-text-tertiary">{stat.label}</dt>
                  <dd
                    className={`num mt-1 whitespace-nowrap font-display text-[17px] font-bold
                      tracking-[-0.04em] ${stat.tone || 'text-text-primary'}`}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* ---- GENERATED. Everything below is the model's prose. -- */}
          <div className="mt-4">
            <ToolReport toolId={tool.id} result={result} />
          </div>

          <Cannot />
          <GroundedIn sources={grounding} />
          <RouteActions limitations={limitations} />
        </div>
      ) : null}
    </Surface>
  )
}

/* ------------------------------------------------------------- states */

function Idle({ tool }) {
  return (
    <div className="px-4 py-6 sm:px-5">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Nothing generated yet. The brief beside this is already complete — it is measured, not
        written, so it needs no model.
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-text-tertiary">
        Running <span className="font-semibold text-text-secondary">{tool.name}</span> adds a
        written analysis over {lowerFirst(tool.uses)}
      </p>
    </div>
  )
}

/**
 * The working state.
 *
 * IT DOES NOT FAKE PROGRESS. The backend performs one round trip and exposes
 * no intermediate events, so there are no per-source ticks completing in
 * sequence — that would be a fabricated tool-call log. What is shown instead is
 * true before the call even starts: the list of sources this run is being given.
 */
function Working({ tool, grounding }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2.5">
        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">
          Writing the analysis
        </p>
      </div>
      <p className="mt-2 text-[11.5px] text-text-tertiary">
        {tool.registryName} is being sent these figures. Everest does not report step-by-step
        progress, because the model returns its answer in one piece.
      </p>

      <ul className="mt-3">
        {grounding.map((source) => (
          <li
            key={source.name}
            className="flex items-baseline justify-between gap-3 border-b border-subtle py-2 last:border-b-0"
          >
            <span className="text-[12px] font-semibold text-text-secondary">{source.name}</span>
            <span className="shrink-0 text-[11px] text-text-tertiary">{source.detail}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2.5 border-t border-subtle pt-3.5" aria-hidden="true">
        {['96%', '88%', '92%', '54%'].map((width) => (
          <span
            key={width}
            className="h-2.5 animate-shimmer rounded-md"
            style={{
              width,
              backgroundImage:
                'linear-gradient(90deg, var(--e2-bg) 0%, var(--e3-bg) 40%, var(--e2-bg) 80%)',
              backgroundSize: '420px 100%',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Every AI-side failure, mapped to what the user can actually do about it.
 *
 * The status code is the discriminator because the backend already maps
 * provider chaos onto a small set: 429 quota, 503 missing key, 502 provider or
 * malformed response, 400 nothing to analyse. Each case says plainly that the
 * measured brief is untouched — which is the single most useful fact in the
 * moment, and the reason the two halves were separated in the first place.
 */
function Notice({ error, provider, onRetry, tool }) {
  const notice = noticeFor(error, provider, tool)

  return (
    <div className="px-4 py-4 sm:px-5">
      <div
        className={`flex items-start gap-3 rounded-panel border p-3.5 ${notice.shell}`}
        role="status"
      >
        <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-control ${notice.iconShell}`}>
          <notice.icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-bold tracking-[-0.015em] ${notice.titleColor}`}>
            {notice.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{notice.body}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {notice.canRetry ? (
          <button type="button" onClick={onRetry} className="btn-ghost px-3.5 py-2 text-[12.5px]">
            <RefreshCw size={12} />
            Try again
          </button>
        ) : null}
        <Link to={notice.altTo} className="btn-ghost px-3.5 py-2 text-[12.5px]">
          {notice.alt}
        </Link>
      </div>

      {/* The load-bearing sentence of the whole design. */}
      <p className="mt-4 flex items-start gap-2.5 border-t border-subtle pt-3.5 text-[11.5px] leading-relaxed text-text-secondary">
        <Check size={13} className="mt-px shrink-0 text-accent" />
        Today’s brief is unaffected — every measurement in it is calculated directly from your
        Everest data, without the AI.
      </p>
    </div>
  )
}

function noticeFor(error, provider, tool) {
  const status = error?.status

  if (status === 429) {
    return {
      icon: AlertTriangle,
      title: 'AI analysis is rate-limited right now',
      body: `This is a quota limit on the ${provider?.provider || 'AI provider'} key, not a problem with your portfolio. The written analysis will work again shortly.`,
      shell: 'border-warn/30 bg-warn/[0.12]',
      iconShell: 'bg-warn/20 text-warn',
      titleColor: 'text-warn',
      canRetry: true,
      alt: 'Open Settings',
      altTo: '/app/settings',
    }
  }

  if (status === 503) {
    return {
      icon: Info,
      title: 'No AI provider configured',
      body: `Written analysis needs a ${provider?.provider || 'provider'} API key. Everything measured on this page keeps working without one.`,
      shell: 'border-accent/30 bg-accent/[0.12]',
      iconShell: 'bg-accent/20 text-accent',
      titleColor: 'text-accent',
      canRetry: false,
      alt: 'Add a key in Settings',
      altTo: '/app/settings',
    }
  }

  if (status === 400) {
    return {
      icon: Plus,
      title: `${tool.name} needs a holding first`,
      body: error?.message || 'This tool reads your positions. Record a holding, or use the watchlist and comparison tools, which only need tracked symbols.',
      shell: 'border-subtle bg-tint/[0.04]',
      iconShell: 'bg-tint/[0.08] text-text-secondary',
      titleColor: 'text-text-primary',
      canRetry: false,
      alt: 'Open Portfolio',
      altTo: '/app/portfolio',
    }
  }

  return {
    icon: AlertTriangle,
    title: 'The written analysis could not be generated',
    body:
      error?.message ||
      'Everest reached the provider but did not get an answer it could use. Nothing was changed and no partial analysis is shown.',
    shell: 'border-down/30 bg-down/[0.1]',
    iconShell: 'bg-down/20 text-down',
    titleColor: 'text-down',
    canRetry: true,
    alt: 'Open Settings',
    altTo: '/app/settings',
  }
}

/* --------------------------------------------------------- explicit limits */

/** Stated on every generated answer, not only when something went wrong. */
function Cannot() {
  return (
    <div className="mt-4 rounded-panel border border-dashed border-subtle p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-control bg-tint/[0.06] text-text-tertiary">
          <Info size={12} />
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold tracking-[-0.01em] text-text-primary">
            What Everest cannot determine
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">
            Everest can measure which holdings drove today’s move and by how much, but it has no
            news, filings, fundamentals or analyst data for these symbols — so it cannot tell you
            why any of them moved, and will not guess.
          </p>
        </div>
      </div>
    </div>
  )
}

function GroundedIn({ sources }) {
  return (
    <div className="mt-3 rounded-panel bg-tint/[0.04] p-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="t-eyebrow">Grounded in</h3>
        <span className="ml-auto text-[10.5px] text-text-tertiary">
          {sources.length} source{sources.length === 1 ? '' : 's'} · no external data
        </span>
      </div>
      <ul>
        {sources.map((source) => (
          <li
            key={source.name}
            className="flex items-baseline justify-between gap-3 border-b border-subtle py-1.5 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check size={11} className="shrink-0 text-accent" />
              <span className="text-[11.5px] font-semibold text-text-primary">{source.name}</span>
            </span>
            <span className="shrink-0 text-right text-[11.5px] text-text-secondary">
              {source.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-text-tertiary">
        Everest sends only these figures. It has no news feed, analyst data, fundamentals or
        forecasts for these tools, so anything it cannot measure is reported as unknown rather than
        estimated.
      </p>
    </div>
  )
}

function RouteActions({ limitations }) {
  return (
    <>
      {limitations?.length ? (
        <ul className="mt-3 space-y-1.5">
          {limitations.map((note) => (
            <li key={note.id} className="flex gap-2 text-[11px] leading-relaxed text-text-tertiary">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" />
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="t-eyebrow !text-[10px] !text-text-tertiary">Where to look</span>
        {[
          { label: 'Open Portfolio', to: '/app/portfolio', note: 'positions and weights' },
          { label: 'Open Watchlist', to: '/app/watchlist', note: 'names you track' },
          { label: 'Open Options', to: '/app/options', note: 'contracts and expiries' },
        ].map((action) => (
          <Link
            key={action.to}
            to={action.to}
            title={action.note}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-subtle
              bg-tint/[0.04] px-3 py-2 text-[12px] font-semibold text-text-primary
              transition-colors duration-150 hover:bg-tint/[0.07]"
          >
            {action.label}
            <ChevronRight size={10} className="text-accent" />
          </Link>
        ))}
      </div>
    </>
  )
}

function lowerFirst(text) {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}.` : ''
}
