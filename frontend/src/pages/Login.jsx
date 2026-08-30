import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'

import { MountainPeak, Wordmark } from '../components/Brand'
import { PageTransition } from '../components/Motion'
import { ErrorState } from '../components/States'
import { useAuth } from '../hooks/useAuth'

const PROOF_POINTS = [
  { icon: TrendingUp, text: 'Real and paper books, tracked side by side' },
  { icon: Sparkles, text: 'Six Gemini-powered research tools' },
  { icon: ShieldCheck, text: 'Your figures never leave the analysis' },
]

/**
 * Split auth layout.
 *
 * Left: a brand panel carrying the mountain motif over the ambient aurora —
 * the "large illustration" half. Right: the form, deliberately sparse. Below
 * lg the brand panel drops away entirely so mobile is just the form.
 */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------- brand panel */}
      <aside className="ambient relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 60% at 20% 15%, rgb(var(--accent-blue-rgb) / 0.22), transparent 65%),' +
              'radial-gradient(60% 55% at 85% 80%, rgb(var(--accent-violet-rgb) / 0.2), transparent 62%)',
          }}
        />

        {/* Oversized peak, cropped — art direction rather than an icon. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 opacity-[0.07]"
        >
          <MountainPeak size={640} className="text-text-primary" />
        </div>

        <div className="relative">
          <Link to="/" aria-label="Everest home">
            <Wordmark size="text-2xl" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="t-display">
            Trade smarter.
            <br />
            <span className="text-gradient">Climb higher.</span>
          </h2>
          <p className="t-body mt-5 text-[15px]">
            One instrument for your whole book — live positions, options, research and AI
            analysis, without stitching five tools together.
          </p>

          <ul className="mt-9 space-y-3.5">
            {PROOF_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="surface-1 grid h-8 w-8 shrink-0 place-items-center rounded-control">
                  <Icon size={14} className="text-accent" />
                </span>
                <span className="text-sm text-text-secondary">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-text-tertiary">Built for traders who think ahead</p>
      </aside>

      {/* ----------------------------------------------------------- form */}
      <main className="flex items-center justify-center px-6 py-14">
        <PageTransition className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Link to="/" aria-label="Everest home">
              <Wordmark size="text-xl" />
            </Link>
          </div>

          <p className="t-eyebrow">Account</p>
          <h1 className="t-page-title mt-2">{title}</h1>
          <p className="t-body mt-2">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 text-sm text-text-secondary">{footer}</p>
        </PageTransition>
      </main>
    </div>
  )
}

export function SubmitButton({ loading, children, loadingLabel = 'Climbing the data...' }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary mt-2 w-full py-3">
      {loading ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight size={15} />
        </>
      )}
    </button>
  )
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(form)
      navigate(location.state?.from || '/app', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          New to Everest?{' '}
          <Link to="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error ? <ErrorState error={error} compact /> : null}

        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
            className="input py-2.5"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            className="input py-2.5"
          />
        </div>

        <SubmitButton loading={loading}>Log In</SubmitButton>
      </form>
    </AuthShell>
  )
}
