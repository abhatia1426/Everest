import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Database,
  LogOut,
  Mail,
  Newspaper,
  Palette,
  Shield,
  Sparkles,
  User,
  Wallet,
} from 'lucide-react'

import { PageHeader } from '../../components/AppLayout'
import { MountainPeak } from '../../components/Brand'
import { ModeToggle } from '../../components/Controls'
import { useAuth } from '../../hooks/useAuth'
import { useMode } from '../../hooks/useMode'
import { useTheme } from '../../hooks/useTheme'
import { Surface } from '../../components/ui/Surface'
import { ThemeToggle } from '../../components/ui/ThemeToggle'

/* --------------------------------------------------------------- pieces */

/**
 * A settings group. The eyebrow sits *outside* the card so the page reads as
 * a sequence of labelled regions rather than one long form — the same
 * grouping idiom used on the dashboard.
 */
function Section({ title, icon: Icon, children }) {
  return (
    <section>
      <h2 className="t-eyebrow mb-2.5 flex items-center gap-2">
        {Icon ? <Icon size={12} /> : null}
        {title}
      </h2>
      <Surface className="overflow-hidden">{children}</Surface>
    </section>
  )
}

function Row({ title, description, children }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 border-b border-subtle
        px-5 py-4 last:border-0"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text-primary">{title}</p>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** Read-only field. Looks like an input so the card reads as a profile, not a list. */
function Field({ icon: Icon, label, value }) {
  return (
    <div>
      <p className="t-eyebrow">{label}</p>
      <div className="surface-1 mt-1.5 flex items-center gap-2.5 px-3 py-2.5">
        <Icon size={14} className="shrink-0 text-text-tertiary" />
        <span className="truncate text-[13px] font-medium text-text-primary">{value || '—'}</span>
      </div>
    </div>
  )
}

/**
 * A data source Everest reads from. Deliberately describes *what each service
 * provides* rather than showing a live "Connected" badge — we have no health
 * endpoint, and a fabricated status indicator on a finance tool is worse than
 * none at all.
 */
function Service({ icon: Icon, name, detail, tint }) {
  return (
    <div className="flex items-start gap-3 border-b border-subtle px-5 py-4 last:border-0">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-control"
        style={{ background: `${tint}1f`, border: `1px solid ${tint}33`, color: tint }}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text-primary">{name}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{detail}</p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- page */

export default function Settings() {
  const { user, logout } = useAuth()
  const { mode } = useMode()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    // Land on the public landing page, not the login form.
    navigate('/', { replace: true })
  }

  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader subtitle="Your account, appearance and trading preferences." />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        {/* ------------------------------------------------- profile card */}
        <Surface className="overflow-hidden lg:sticky lg:top-6">
          <div className="p-5">
            <span
              className="grid h-14 w-14 place-items-center rounded-panel text-[18px] font-bold
                tracking-tight text-accent"
              style={{
                background: 'rgb(var(--accent-blue-rgb) / 0.12)',
                border: '1px solid rgb(var(--accent-blue-rgb) / 0.22)',
              }}
              aria-hidden="true"
            >
              {initials}
            </span>

            <p className="mt-3.5 truncate text-[17px] font-semibold tracking-tight text-text-primary">
              {user?.name || 'Trader'}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-text-secondary">{user?.email}</p>

            <span
              className="surface-1 mt-3 inline-flex items-center gap-1.5 px-2.5
                py-1 text-[11px] font-semibold text-text-secondary"
            >
              <Wallet size={11} className="text-accent" />
              {mode === 'paper' ? 'Paper trading' : 'Real book'}
            </span>

            <div className="divider my-5" />

            <div className="space-y-3.5">
              <Field icon={User} label="Name" value={user?.name} />
              <Field icon={Mail} label="Email" value={user?.email} />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2
                rounded-control border border-down/25 bg-down/[0.08] py-2.5 text-[13px]
                font-semibold text-down transition-colors duration-200 hover:bg-down/[0.14]"
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        </Surface>

        {/* ----------------------------------------------------- sections */}
        <div className="space-y-7">
          <Section title="Appearance" icon={Palette}>
            <Row
              title="Theme"
              description={
                theme === 'dark'
                  ? 'Dark — the default, tuned for long sessions on a trading desk.'
                  : 'Light — higher ambient contrast for bright rooms.'
              }
            >
              <ThemeToggle />
            </Row>
            <Row
              title="Motion"
              description="Everest follows your system's reduced-motion setting. Turn it on in your OS
                accessibility settings to mute transitions."
            />
          </Section>

          <Section title="Trading" icon={BarChart3}>
            <Row
              title="Default mode"
              description={
                mode === 'paper'
                  ? 'Paper — positions are simulated and kept separate from your real book.'
                  : 'Real — positions represent capital you have actually deployed.'
              }
            >
              <ModeToggle />
            </Row>
            <Row
              title="Price refresh"
              description="Quotes refresh every 30 seconds while a tab is visible, and pause when it is not."
            />
            <Row
              title="Options valuation"
              description="Estimated as intrinsic value plus a linear time premium — directional only,
                not a pricing model. Treat option P&L as an indication, not a mark."
            />
          </Section>

          <Section title="Data sources" icon={Database}>
            <Service
              icon={BarChart3}
              name="Finnhub"
              detail="Live quotes, company profiles and fundamentals. When the provider is unreachable,
                Everest labels the last known figures as cached rather than substituting a value.
                Historical charts require a Finnhub plan that includes candle data."
              tint="#5b8cff"
            />
            <Service
              icon={Newspaper}
              name="newsdata.io"
              detail="Headlines for the tickers you hold or watch, tagged by sentiment. Articles link
                out to their original publisher — Everest never rewrites or summarises them without
                labelling it."
              tint="#ffb443"
            />
            <Service
              icon={Sparkles}
              name="Google Gemini"
              detail="Powers the six research tools in the AI workspace. Every response is model-generated
                interpretation, not financial advice, and is labelled as such."
              tint="#9d7bff"
            />
          </Section>

          <Section title="Privacy" icon={Shield}>
            <Row
              title="Where your data lives"
              description="Positions, options and watchlist entries are stored against your account and
                are never shared between users."
            />
            <Row
              title="AI context"
              description="Research prompts include the tickers and figures relevant to the question you
                ask. Nothing is used to train a model."
            />
          </Section>

          <div className="flex items-center gap-4 px-1 pb-2">
            <MountainPeak size={30} className="shrink-0 text-text-tertiary" />
            <p className="text-[12px] leading-relaxed text-text-tertiary">
              <span className="font-semibold text-text-secondary">Everest v1.0</span> — built for
              traders who think ahead. Everest is a tracking and research tool, not a broker, and
              nothing here constitutes financial advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
