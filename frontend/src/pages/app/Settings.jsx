import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Database,
  LineChart,
  LogOut,
  Minus,
  Moon,
  Newspaper,
  Palette,
  Sparkles,
  Sun,
  User,
  Wallet,
} from 'lucide-react'

import { PageHeader } from '../../components/AppLayout'
import { useMotionSafe } from '../../components/Motion'
import { Surface } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useMode } from '../../hooks/useMode'
import { useTheme } from '../../hooks/useTheme'
import { api } from '../../lib/api'
import { QUOTE_POLL_MS, TTL } from '../../lib/cache'
import {
  LOCAL_STORES,
  clearAllLocalData,
  clearStore,
  formatSize,
  storeSize,
} from '../../lib/localData'

/*
 * SETTINGS
 *
 * The quietest authenticated route. It carries no figures of its own, so it
 * gets no charts, no stat tiles and no hero — a sticky category rail, one
 * focused pane, and a small system block that reports state the app already
 * knows rather than monitoring anything.
 *
 * The hard rule on this screen is that every sentence is checkable against
 * the code. Where the product cannot do something (edit a profile, change a
 * password, delete an account) it says so plainly instead of rendering a
 * control that would have to lie. Storage descriptions come from
 * `lib/localData`, cadence and freshness from `lib/cache`, and the AI
 * provider from `GET /ai/provider` — none of it is restated here.
 */

const CATEGORIES = [
  { id: 'account', label: 'Account', sub: 'Profile · session', icon: User },
  { id: 'appearance', label: 'Appearance', sub: 'Theme · motion', icon: Palette },
  { id: 'mode', label: 'Portfolio mode', sub: 'Real · Paper', icon: Wallet },
  { id: 'data', label: 'Market data', sub: 'Quotes · sources', icon: LineChart },
  { id: 'ai', label: 'AI provider', sub: 'Everest AI · model', icon: Sparkles },
  { id: 'local', label: 'Local data', sub: 'This browser', icon: Database },
  { id: 'danger', label: 'Danger zone', sub: 'Clear · log out', icon: AlertTriangle },
]

/* ------------------------------------------------------------------ pieces */

function SectionLabel({ children, tone = 'quiet' }) {
  return (
    <h2
      className={`t-eyebrow mb-2.5 ${tone === 'danger' ? '!text-down' : ''}`}
    >
      {children}
    </h2>
  )
}

/**
 * One settings row: a label, an explanation, and at most one control.
 *
 * Stacks below 760px so a control is never squeezed against a paragraph, and
 * the control aligns to the start rather than centring into empty space.
 */
function Row({ title, description, children, titleClass = '', className = '' }) {
  return (
    <div
      className={`flex flex-col items-stretch gap-3 border-b border-subtle px-5 py-4
        last:border-0 min-[760px]:flex-row min-[760px]:items-start min-[760px]:gap-6
        sm:px-[22px] ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-semibold text-text-primary ${titleClass}`}>{title}</p>
        {description ? (
          <p className="mt-1 max-w-[560px] text-[12.5px] leading-relaxed text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2 self-start min-[760px]:self-auto">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** Neutral status chip. The default answer for "what does Everest do here". */
function Chip({ children, tone = 'neutral', dot = false }) {
  const tones = {
    neutral: 'surface-1 text-text-secondary',
    quiet: 'surface-1 text-text-tertiary',
    warn: 'bg-warn/[0.14] text-warn border border-warn/30',
    accent: 'bg-accent/[0.14] text-accent border border-accent/30',
    up: 'bg-up/[0.14] text-up border border-up/30',
    down: 'bg-down/[0.14] text-down border border-down/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5
        text-[11px] font-bold ${tones[tone] || tones.neutral}`}
    >
      {dot ? <span className="h-[5px] w-[5px] rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

/** The one shared button shape on this page. Danger tone for the wipe. */
function ActionButton({ onClick, children, tone = 'neutral', title }) {
  const tones = {
    neutral: 'surface-1 text-text-primary hover:bg-card-hover',
    danger: 'border border-down/40 bg-transparent text-down hover:bg-down/[0.08]',
    dangerSolid: 'border border-transparent bg-down text-white hover:opacity-90',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap
        rounded-full px-4 py-2.5 text-[12.5px] font-semibold transition-colors duration-200
        ${tones[tone] || tones.neutral}`}
    >
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------- account */

function AccountSection({ user, onLogout }) {
  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <section>
      <SectionLabel>Account</SectionLabel>
      <Surface className="overflow-hidden">
        <div className="flex items-center gap-4 border-b border-subtle px-5 py-5 sm:px-[22px]">
          <span
            className="grid h-13 w-13 shrink-0 place-items-center rounded-panel font-display
              text-[18px] font-extrabold tracking-tight text-accent"
            style={{
              height: 52,
              width: 52,
              background: 'rgb(var(--accent-blue-rgb) / 0.14)',
              border: '1px solid rgb(var(--accent-blue-rgb) / 0.28)',
            }}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[19px] font-bold tracking-tight text-text-primary">
              {user?.name || 'Trader'}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-text-secondary">{user?.email}</p>
          </div>
          {/*
           * The design also carried an "Account since" figure. `/auth/me`
           * returns id, name and email only — `created_at` is written at
           * registration but never serialised — so the field is omitted
           * rather than filled with a plausible date.
           */}
          <div className="hidden shrink-0 text-right sm:block">
            <p className="t-eyebrow">Modes</p>
            <p className="mt-1 whitespace-nowrap text-[12.5px] font-semibold text-text-primary">
              Real · Paper
            </p>
          </div>
        </div>

        <Row
          title="Name and email"
          description="Set when the account was created. Everest has no profile-edit endpoint, so these
            are read-only here."
        >
          <Chip tone="quiet">Read-only</Chip>
        </Row>

        <Row
          title="Password"
          description="Changing a password is not supported in this version. Your password is stored
            only as a bcrypt hash on the Everest server, and is never returned to the browser."
        >
          <Chip tone="quiet">Not supported in this version</Chip>
        </Row>

        <Row
          title="Session"
          description="Signed in on this browser. The session token expires seven days after sign-in;
            the first request after that returns you to the login screen. There is no server-side
            way to end a session early, so logging out clears the token held here."
        >
          <ActionButton onClick={onLogout}>
            <LogOut size={13} />
            Log out
          </ActionButton>
        </Row>
      </Surface>
    </section>
  )
}

/* -------------------------------------------------------------- appearance */

function AppearanceSection({ theme, setTheme, motionSafe }) {
  return (
    <section>
      <SectionLabel>Appearance</SectionLabel>
      <Surface className="overflow-hidden">
        <Row
          title="Theme"
          description="Dark is the default, tuned for long sessions on a trading desk. Everest
            deliberately does not follow your operating system — whatever you pick here is kept, in
            this browser only."
        >
          <div
            role="radiogroup"
            aria-label="Theme"
            className="well flex gap-1 rounded-full p-[3px]"
          >
            {[
              { value: 'dark', label: 'Dark', Icon: Moon },
              { value: 'light', label: 'Light', Icon: Sun },
            ].map(({ value, label, Icon }) => {
              const active = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2
                    text-[12.5px] transition-colors duration-200 ${
                      active
                        ? 'bg-accent font-bold text-white'
                        : 'font-medium text-text-secondary hover:text-text-primary'
                    }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              )
            })}
          </div>
        </Row>

        <Row
          title="Motion"
          description="Everest reads your system's reduced-motion setting and mutes transitions when
            it is on. There is no separate switch here, so the two can never disagree."
        >
          <Chip dot tone={motionSafe ? 'neutral' : 'accent'}>
            {motionSafe ? 'Following system' : 'Reduced — following system'}
          </Chip>
        </Row>

        <Row
          title="Gain and loss colours"
          description="Green and red are reserved for financial direction and are not configurable —
            a fixed mapping is what makes a figure readable at a glance on every route."
        >
          <Chip tone="up">+ Up</Chip>
          <Chip tone="down">− Down</Chip>
        </Row>
      </Surface>
    </section>
  )
}

/* ------------------------------------------------------------------- mode */

/**
 * What each mode scopes, verified against the backend.
 *
 * `positions` and `options` carry a `mode` field and are indexed on
 * `(user_id, mode)`; `watchlist` is indexed on `(user_id, ticker)` and its
 * router takes no mode parameter at all. Totals are derived from the
 * positions the mode returns, so they follow.
 */
const MODE_SCOPE = [
  { k: 'Positions and cost basis', v: 'Separate per mode', scoped: true },
  { k: 'Tracked option contracts', v: 'Separate per mode', scoped: true },
  { k: 'Totals, P/L and performance', v: 'Recalculated for the mode you are in', scoped: true },
  { k: 'Watchlist', v: 'Shared across both', scoped: false },
  { k: 'Quotes, profiles and headlines', v: 'Shared across both', scoped: false },
  {
    k: 'AI tools',
    v: 'Shared — portfolio analyses read the mode you are in',
    scoped: false,
  },
]

function ModeSection({ mode, setMode }) {
  const paper = mode === 'paper'

  const card = (value, label, body) => {
    const active = mode === value
    return (
      <button
        key={value}
        type="button"
        onClick={() => setMode(value)}
        aria-pressed={active}
        className="card cursor-pointer p-[18px] text-left transition-shadow duration-200"
        style={{
          boxShadow: active
            ? 'var(--shadow-card), inset 0 0 0 1.5px var(--accent-blue)'
            : undefined,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${
              active ? 'bg-accent/[0.16]' : 'surface-1'
            }`}
            style={active ? { boxShadow: 'inset 0 0 0 1px var(--accent-blue)' } : undefined}
          >
            {active ? <span className="h-[9px] w-[9px] rounded-full bg-accent" /> : null}
          </span>
          <span
            className={`font-display text-[16px] font-bold tracking-tight ${
              active ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            {label}
          </span>
          {active ? (
            <span className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.06em] text-accent">
              Active
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-text-secondary">{body}</p>
      </button>
    )
  }

  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Portfolio mode</SectionLabel>
        <div className="grid gap-3 min-[900px]:grid-cols-2">
          {card(
            'real',
            'Real portfolio',
            'Positions you entered to mirror capital you have actually deployed. Everest places no orders — it records and prices what you tell it you hold.',
          )}
          {card(
            'paper',
            'Paper portfolio',
            'A separate, simulated portfolio for testing ideas. Everest tracks it exactly as it tracks the real one, priced with the same live quotes and stored separately on the server. It is not connected to a broker or a fill simulator.',
          )}
        </div>
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-subtle px-5 py-4 sm:px-[22px]">
          <p className="text-[13px] font-semibold text-text-primary">
            What changes when you switch
          </p>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-text-secondary">
            Mode takes effect immediately on every route. Nothing is deleted by switching — each
            mode keeps its own positions and contracts on the server.
          </p>
        </div>
        {MODE_SCOPE.map((entry) => (
          <div
            key={entry.k}
            className="flex items-center gap-4 border-b border-subtle px-5 py-3 last:border-0
              sm:px-[22px]"
          >
            <span
              className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] ${
                entry.scoped ? 'bg-accent/[0.16] text-accent' : 'surface-1 text-text-tertiary'
              }`}
            >
              {entry.scoped ? <Check size={10} strokeWidth={2.6} /> : <Minus size={10} strokeWidth={2.6} />}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-text-primary">
              {entry.k}
            </span>
            <span className="shrink-0 text-right text-[12px] text-text-secondary">{entry.v}</span>
          </div>
        ))}
      </Surface>

      <Surface className="flex items-start gap-3 !rounded-panel p-4">
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] bg-warn/[0.14] text-warn">
          <AlertTriangle size={14} />
        </span>
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">
            Your choice of mode lives in this browser.
          </span>{' '}
          It is stored locally and is not part of your account, so signing in elsewhere starts in{' '}
          {paper ? 'Real' : 'Real'} — check the badge in the header before you read a figure or
          record a position.
        </p>
      </Surface>
    </section>
  )
}

/* ------------------------------------------------------------ market data */

const SOURCES = [
  {
    name: 'Finnhub',
    role: 'Quotes · profiles',
    tint: '#5b8cff',
    Icon: LineChart,
    detail:
      'Live prices and company profiles for every ticker in the product. One provider, wired on the server.',
  },
  {
    name: 'Twelve Data',
    role: 'Historical candles',
    tint: '#5b8cff',
    Icon: LineChart,
    detail:
      'Daily candles behind the charts, when a key is configured on the server. Without one, history falls back to Finnhub — where candles need a paid plan — and Everest reports the gap rather than drawing a line it cannot source.',
  },
  {
    name: 'newsdata.io',
    role: 'Headlines',
    tint: '#ffb443',
    Icon: Newspaper,
    detail:
      'Headlines for names you hold or watch, tagged by sentiment. Articles link out to the original publisher and are never rewritten. The server picks the news vendor from the shape of its own key, so newsapi.org may serve these instead.',
  },
  {
    name: 'Google Gemini',
    role: 'Written analysis',
    tint: '#9d7bff',
    Icon: Sparkles,
    detail:
      'Powers the research tools in AI Insights. Every response is model-generated interpretation of your own figures, labelled as such, and never financial advice.',
  },
]

function DataSection() {
  const seconds = (ms) => `${Math.round(ms / 1000)} s`

  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Market data</SectionLabel>
        <Surface className="overflow-hidden">
          <Row
            title="Quote refresh"
            description="Prices refresh on a fixed interval while a tab is visible and pause when it
              is not, so a screen nobody is watching burns no provider quota."
          >
            <Chip>Every {seconds(QUOTE_POLL_MS)} · automatic</Chip>
          </Row>

          <Row
            title="Freshness windows"
            description="Everest reuses a cached quote only inside these windows. Past the second one
              a page waits for the network rather than showing you an old number."
          >
            <div className="flex gap-2">
              {[
                {
                  k: 'Reused',
                  v: seconds(TTL.QUOTE.fresh),
                  tip: `Inside ${seconds(TTL.QUOTE.fresh)} a quote is served from cache with no network call at all.`,
                },
                {
                  k: 'Refreshed',
                  v: seconds(TTL.QUOTE.stale),
                  tip: `Between ${seconds(TTL.QUOTE.fresh)} and ${seconds(TTL.QUOTE.stale)} the cached figure is shown immediately and revalidated behind it.`,
                },
                {
                  k: 'Held back',
                  v: 'Older',
                  tip: `Past ${seconds(TTL.QUOTE.stale)} Everest waits for the provider rather than displaying a figure that could be wrong.`,
                },
              ].map((w) => (
                <div key={w.k} title={w.tip} className="surface-1 min-w-[74px] cursor-help px-2.5 py-2">
                  <p className="t-eyebrow whitespace-nowrap">{w.k}</p>
                  <p className="mt-0.5 whitespace-nowrap font-display text-[14px] font-bold tracking-tight text-text-primary">
                    {w.v}
                  </p>
                </div>
              ))}
            </div>
          </Row>

          <Row
            title="When a quote is unavailable"
            description="A holding with no usable price is carried at your own cost basis and
              labelled everywhere it appears — in totals, movers and AI context. Cost basis is not a
              market price, and Everest never presents it as one or substitutes an estimate."
          >
            <Chip tone="warn">Labelled, never estimated</Chip>
          </Row>
        </Surface>
      </div>

      <div>
        <SectionLabel>Where the data comes from</SectionLabel>
        <Surface className="overflow-hidden">
          {SOURCES.map((source) => (
            <div
              key={source.name}
              className="flex items-start gap-3 border-b border-subtle px-5 py-4 last:border-0
                sm:px-[22px]"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-panel"
                style={{
                  background: `${source.tint}24`,
                  border: `1px solid ${source.tint}4d`,
                  color: source.tint,
                }}
              >
                <source.Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-text-primary">{source.name}</span>
                  <span className="surface-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-text-tertiary">
                    {source.role}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                  {source.detail}
                </p>
              </div>
            </div>
          ))}
          <p className="surface-1 !rounded-none px-5 py-3 text-[12px] leading-relaxed text-text-tertiary sm:px-[22px]">
            Providers are wired on the server. There is no provider switching, no exchange or
            quote-source selection, and no setting here changes where a figure came from.
          </p>
        </Surface>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- ai provider */

/**
 * Every state the AI layer can actually be in, with the status the server
 * really returns. All four are raised in `services/gemini.py`; only the first
 * two are knowable from `GET /ai/provider`, so the other two are never
 * marked as current.
 */
const AI_STATES = [
  {
    id: 'configured',
    k: 'Configured',
    code: 'HTTP 200',
    tone: 'text-up',
    detail: 'Key accepted, model responding, JSON validated before it reaches a screen.',
  },
  {
    id: 'missing',
    k: 'No key configured',
    code: 'HTTP 503',
    tone: 'text-warn',
    detail:
      'No key in the server environment. The AI tools are unavailable; every measured figure is not.',
  },
  {
    id: 'limited',
    k: 'Rate limited',
    code: 'HTTP 429',
    tone: 'text-warn',
    detail:
      "Quota exhausted on the key. Everest says so plainly and offers a retry instead of failing silently. It is a limit on the key, not a problem with your portfolio.",
  },
  {
    id: 'rejected',
    k: 'Key rejected or model retired',
    code: 'HTTP 502',
    tone: 'text-down',
    detail:
      'The provider refused the key, or the pinned model has been withdrawn. Both need a change on the server, not a retry.',
  },
]

function AISection({ provider, error, navigate }) {
  const configured = provider?.configured
  const status = error
    ? { label: 'Unavailable', tone: 'quiet', current: null }
    : provider === null
      ? { label: 'Checking…', tone: 'quiet', current: null }
      : configured
        ? { label: 'Configured', tone: 'up', current: 'configured' }
        : { label: 'No key configured', tone: 'warn', current: 'missing' }

  const explain = error
    ? 'Everest could not reach its own server to read the provider state. The AI tools may still work; this row reports only what the check returned.'
    : provider === null
      ? 'Reading the provider state from the Everest server.'
      : configured
        ? 'A key is present on the server and the pinned model is answering. The research tools in AI Insights are available.'
        : 'No key is set in the server environment, so the AI tools return a 503 and no written analysis is produced. Everything measured from your own data keeps working.'

  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>AI provider</SectionLabel>
        <Surface className="overflow-hidden">
          <div className="flex items-start gap-3.5 border-b border-subtle px-5 py-5 sm:px-[22px]">
            <span
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-panel"
              style={{
                background: 'rgb(var(--accent-violet-rgb) / 0.14)',
                border: '1px solid rgb(var(--accent-violet-rgb) / 0.3)',
                color: 'var(--accent-violet)',
              }}
            >
              <Sparkles size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-display text-[16px] font-bold tracking-tight text-text-primary">
                  {provider?.label || 'Everest AI'}
                </span>
                <Chip dot tone={status.tone}>
                  {status.label}
                </Chip>
              </div>
              <p className="mt-1.5 max-w-[600px] text-[12.5px] leading-relaxed text-text-secondary">
                {explain}
              </p>
            </div>
          </div>

          <Row
            title="API key"
            description="The key is read from GEMINI_API_KEY in the server environment. It is never
              sent to the browser, so it cannot be viewed, copied or replaced from Settings."
          >
            <div className="surface-1 flex items-center gap-2.5 px-3 py-2">
              <span className="text-[12px] tracking-[0.22em] text-text-tertiary">••••••••</span>
              <span className="hairline h-3.5 w-px" />
              <span className="whitespace-nowrap text-[11px] font-bold text-text-secondary">
                Server-side
              </span>
            </div>
          </Row>

          <Row
            title="Provider and model"
            description="Pinned deliberately. Every AI tool depends on the model honouring a response
              schema, so Everest does not follow a floating alias that could change that behaviour
              without a deploy."
          >
            {provider ? (
              <div className="surface-1 px-3 py-2 text-right">
                <p className="whitespace-nowrap text-[11px] font-semibold text-text-tertiary">
                  {provider.provider}
                </p>
                <p className="mt-0.5 whitespace-nowrap font-display text-[12px] font-semibold text-text-primary">
                  {provider.model}
                </p>
              </div>
            ) : (
              <Chip tone="quiet">{error ? 'Unavailable' : 'Checking…'}</Chip>
            )}
          </Row>

          <Row
            title="What is sent"
            description="Only the figures a tool needs: your positions and cost basis, live quotes,
              sector weights, watchlist history and tracked contracts. Responses are requested as
              JSON and validated before they reach a screen. Nothing is used to train a model."
          >
            <button
              type="button"
              onClick={() => navigate('/app/ai')}
              className="cursor-pointer whitespace-nowrap text-[12.5px] font-semibold text-accent
                hover:underline"
            >
              Open AI Insights
            </button>
          </Row>
        </Surface>
      </div>

      <div>
        <SectionLabel>Provider states you may see</SectionLabel>
        <Surface className="overflow-hidden">
          {AI_STATES.map((state) => {
            const current = state.id === status.current
            return (
              <div
                key={state.id}
                className={`flex items-start gap-3 border-b border-subtle px-5 py-3.5 last:border-0
                  sm:px-[22px] ${current ? 'surface-1 !rounded-none' : ''}`}
              >
                <span className={`mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full ${state.tone} bg-current`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[12.5px] font-bold ${state.tone}`}>{state.k}</span>
                    <span className="text-[10.5px] font-semibold text-text-tertiary">
                      {state.code}
                    </span>
                    {current ? (
                      <span className="text-[10.5px] font-bold text-accent">Current</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                    {state.detail}
                  </p>
                </div>
              </div>
            )
          })}
          <p className="surface-1 !rounded-none px-5 py-3 text-[12px] leading-relaxed text-text-tertiary sm:px-[22px]">
            Measured figures on every route are calculated from your own Everest data and keep
            working in all four states. Only written analysis depends on the provider.
          </p>
        </Surface>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- local data */

function LocalDataSection({ sizes, onClear }) {
  return (
    <section>
      <SectionLabel>Stored in this browser</SectionLabel>
      <Surface className="overflow-hidden">
        {LOCAL_STORES.map((store) => {
          const size = sizes[store.id] ?? 0
          return (
            <div
              key={store.id}
              className="flex flex-col gap-3 border-b border-subtle px-5 py-3.5 last:border-0
                min-[760px]:flex-row min-[760px]:items-center min-[760px]:gap-5 sm:px-[22px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-text-primary">
                    {store.label}
                  </span>
                  <span className="whitespace-nowrap font-display text-[11px] font-medium text-text-tertiary">
                    {store.keys.join(' · ')}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                  {store.detail}
                </p>
              </div>
              {/*
               * `contents` from 760px up so the size and the action rejoin the
               * row's own flex line. Below that they pair off on one line of
               * their own — a stacked layout that put the byte count and the
               * button on separate centred rows read as two unrelated things.
               */}
              <div className="flex items-center justify-between gap-3 min-[760px]:contents">
                <span className="shrink-0 whitespace-nowrap text-[11.5px] text-text-tertiary">
                  {formatSize(size)}
                </span>
                {store.clearable ? (
                  <button
                    type="button"
                    disabled={size === 0}
                    onClick={() => onClear(store)}
                    title={
                      size === 0
                        ? 'Nothing stored'
                        : `Removes ${store.keys.join(' and ')} from this browser only`
                    }
                    className="surface-1 shrink-0 rounded-full px-3.5 py-1.5 text-[12px]
                      font-semibold text-text-secondary transition-colors duration-200
                      enabled:cursor-pointer enabled:hover:text-text-primary disabled:opacity-45
                      min-[760px]:min-w-[82px]"
                  >
                    {size === 0 ? 'Empty' : 'Clear'}
                  </button>
                ) : (
                  <span
                    title={store.note}
                    className="shrink-0 cursor-help rounded-full px-3.5 py-1.5 text-center
                      text-[12px] font-semibold text-text-tertiary min-[760px]:min-w-[82px]"
                  >
                    Required
                  </span>
                )}
              </div>
            </div>
          )
        })}
        <p className="surface-1 !rounded-none px-5 py-3 text-[12px] leading-relaxed text-text-tertiary sm:px-[22px]">
          Positions, tracked contracts and watchlist entries live on the Everest server against your
          account. Clearing anything above removes a local convenience only — never a holding.
        </p>
      </Surface>
    </section>
  )
}

/* ------------------------------------------------------------ danger zone */

function DangerSection({ onLogout, wiping, setWiping, onWipe, keyCount }) {
  return (
    <section className="space-y-5">
      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="t-eyebrow !text-down">Danger zone</span>
          <span
            className="h-[7px] flex-1 rounded"
            style={{
              background:
                'repeating-linear-gradient(45deg, rgb(var(--accent-red-rgb) / 0.26) 0 1.5px, transparent 1.5px 7px)',
            }}
            aria-hidden="true"
          />
        </div>

        <Surface
          className="overflow-hidden"
          style={{ boxShadow: 'var(--shadow-card), inset 0 0 0 1px rgb(var(--accent-red-rgb) / 0.18)' }}
        >
          <Row
            title="Log out of this browser"
            description="Drops the session token and your stored name and email, then returns you to
              the landing page. Your positions, watchlist and tracked contracts are untouched."
          >
            <ActionButton onClick={onLogout}>
              <LogOut size={13} />
              Log out
            </ActionButton>
          </Row>

          <Row
            title="Clear all local Everest data"
            titleClass="!text-down"
            description={`Removes every key this browser holds — theme, portfolio mode, saved AI runs, recent searches, pinned names and cached logos — and, because the session is stored the same way, signs you out. Nothing on the Everest server is deleted: your positions, tracked contracts and watchlist are restored when you sign back in.`}
          >
            {wiping ? (
              <ActionButton onClick={() => setWiping(false)}>Cancel</ActionButton>
            ) : null}
            <ActionButton onClick={onWipe} tone={wiping ? 'dangerSolid' : 'danger'}>
              {wiping ? 'Clear and log out' : 'Clear local data'}
            </ActionButton>
          </Row>

          {wiping ? (
            <div className="border-b border-subtle px-5 pb-4 sm:px-[22px]">
              <p
                className="flex items-start gap-2 rounded-panel bg-down/[0.12] px-3 py-2.5
                  text-[12px] leading-relaxed text-text-primary"
                role="alert"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-down" />
                This clears {keyCount} local keys and ends your session. It cannot be undone from
                here.
              </p>
            </div>
          ) : null}

          <Row
            title="Delete account"
            description="Everest has no account-deletion endpoint in this version, so this cannot be
              done from the app. An administrator has to remove your user record and the positions,
              options and watchlist rows attached to it."
          >
            <Chip tone="quiet">Not supported in this version</Chip>
          </Row>
        </Surface>
      </div>

      <p className="max-w-[700px] px-0.5 text-[11.5px] leading-relaxed text-text-tertiary">
        Everest v1.0 — a tracking and research tool, not a broker. Quotes, headlines and written
        analysis are provided as-is, and nothing in the product constitutes financial advice.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------- page */

export default function Settings() {
  const { user, logout } = useAuth()
  const { mode, setMode } = useMode()
  const { theme, setTheme } = useTheme()
  const motionSafe = useMotionSafe()
  const navigate = useNavigate()
  const toast = useToast()

  const [category, setCategory] = useState('account')
  const [wiping, setWiping] = useState(false)
  // Storage is read imperatively, so a clear has to tell the page to re-measure.
  const [storageTick, setStorageTick] = useState(0)

  const { data: provider, error: providerError } = useApi(api.aiProvider, [], {
    key: 'ai:provider',
    ttl: TTL.PROFILE,
  })

  const sizes = useMemo(() => {
    const next = {}
    for (const store of LOCAL_STORES) next[store.id] = storeSize(store)
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageTick])

  const handleLogout = () => {
    logout()
    // Land on the public landing page, not the login form.
    navigate('/', { replace: true })
  }

  const handleClear = (store) => {
    if (clearStore(store.id)) {
      setStorageTick((n) => n + 1)
      toast.success(`${store.label} cleared`, 'Removed from this browser only.')
    }
  }

  /*
   * Two-step on purpose. The first press arms the action and reveals exactly
   * what it will do; only the second press clears anything. This is the one
   * control on the screen that ends the session, and it never does so from a
   * single click on a row the user was reading.
   */
  const handleWipe = () => {
    if (!wiping) {
      setWiping(true)
      return
    }
    clearAllLocalData()
    logout()
    navigate('/', { replace: true })
  }

  const active = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        subtitle="Your account, appearance and market-data preferences. Everest is a tracking and
          research tool, not a broker — nothing here places or cancels an order."
        actions={
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2
              text-[11.5px] font-bold ${
                mode === 'paper'
                  ? 'border border-warn/30 bg-warn/[0.14] text-warn'
                  : 'border border-accent/30 bg-accent/[0.14] text-accent'
              }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {mode === 'paper' ? 'Paper portfolio' : 'Real portfolio'}
          </span>
        }
      />

      <div className="grid gap-4 min-[900px]:grid-cols-[236px_minmax(0,1fr)] min-[900px]:items-start">
        {/* ------------------------------------------------ category rail */}
        {/*
         * `min-w-0` is load-bearing below 900px. There the rail is a
         * horizontally scrolling strip of seven fixed-width chips, and a grid
         * item defaults to a min-content floor — so without this the track
         * sizes to all seven chips and the whole PAGE scrolls sideways instead
         * of the rail.
         */}
        <div className="flex min-w-0 flex-col gap-3 min-[900px]:sticky min-[900px]:top-4">
          <Surface
            as="nav"
            aria-label="Settings categories"
            className="flex gap-2 overflow-x-auto !rounded-panel !bg-transparent !shadow-none
              min-[900px]:flex-col min-[900px]:gap-0 min-[900px]:!rounded-card
              min-[900px]:!bg-[rgb(var(--bg-card-rgb))] min-[900px]:p-1.5
              min-[900px]:!shadow-[var(--shadow-card)]"
            style={{ scrollbarWidth: 'none' }}
          >
            {CATEGORIES.map((c) => {
              const on = c.id === category
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => {
                    setCategory(c.id)
                    setWiping(false)
                  }}
                  className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-panel
                    px-2.5 py-2.5 text-left transition-colors duration-200 min-[900px]:w-full
                    ${on ? 'surface-1 !rounded-panel' : 'hover:bg-card-hover'}`}
                >
                  <span
                    className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] ${
                      on ? 'bg-accent/[0.16] text-accent' : 'surface-1 text-text-tertiary'
                    }`}
                  >
                    <c.icon size={12} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block whitespace-nowrap text-[12.5px] tracking-[-0.01em] ${
                        on ? 'font-bold text-text-primary' : 'font-medium text-text-secondary'
                      }`}
                    >
                      {c.label}
                    </span>
                    <span className="mt-px hidden whitespace-nowrap text-[10.5px] text-text-tertiary min-[900px]:block">
                      {c.sub}
                    </span>
                  </span>
                </button>
              )
            })}
          </Surface>

          {/* --------------------------------------------- system status */}
          <Surface className="hidden p-3.5 min-[900px]:block">
            <p className="t-eyebrow">System</p>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {[
                {
                  k: 'Market data',
                  v: `Every ${Math.round(QUOTE_POLL_MS / 1000)}s`,
                  color: 'text-text-secondary',
                  tip: 'Quotes refresh on a fixed interval while a tab is visible, and pause when it is not.',
                },
                {
                  k: 'AI provider',
                  v: providerError
                    ? 'Unavailable'
                    : provider === null
                      ? 'Checking…'
                      : provider.configured
                        ? 'Configured'
                        : 'No key',
                  color: providerError
                    ? 'text-text-tertiary'
                    : provider?.configured
                      ? 'text-up'
                      : provider === null
                        ? 'text-text-tertiary'
                        : 'text-warn',
                  tip: 'Read from GET /ai/provider. Reports whether a key is present on the server.',
                },
                {
                  k: 'Portfolio data',
                  v: mode === 'paper' ? 'Paper portfolio' : 'Real portfolio',
                  color: 'text-accent',
                  tip: 'Which portfolio every route is currently reading.',
                },
              ].map((row) => (
                <div key={row.k} title={row.tip} className="flex cursor-help items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${row.color}`} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-secondary">
                    {row.k}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-[11px] font-bold ${row.color}`}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
            <div className="divider my-3" />
            <p className="text-[10.5px] leading-relaxed text-text-tertiary">
              Everest v1.0 · states shown are read from the app, not monitored.
            </p>
          </Surface>
        </div>

        {/* --------------------------------------------------- the pane */}
        <div className="min-w-0">
          {active.id === 'account' ? (
            <AccountSection user={user} onLogout={handleLogout} />
          ) : null}
          {active.id === 'appearance' ? (
            <AppearanceSection theme={theme} setTheme={setTheme} motionSafe={motionSafe} />
          ) : null}
          {active.id === 'mode' ? <ModeSection mode={mode} setMode={setMode} /> : null}
          {active.id === 'data' ? <DataSection /> : null}
          {active.id === 'ai' ? (
            <AISection provider={provider} error={providerError} navigate={navigate} />
          ) : null}
          {active.id === 'local' ? (
            <LocalDataSection sizes={sizes} onClear={handleClear} />
          ) : null}
          {active.id === 'danger' ? (
            <DangerSection
              onLogout={handleLogout}
              wiping={wiping}
              setWiping={setWiping}
              onWipe={handleWipe}
              keyCount={LOCAL_STORES.reduce((n, s) => n + s.keys.length, 0)}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
