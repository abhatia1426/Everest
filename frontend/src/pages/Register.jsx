import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorState } from '../components/States'
import { useAuth } from '../hooks/useAuth'
import { AuthShell, SubmitButton } from './Login'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError(null)

    if (form.password.length < 8) {
      setError(new Error('Password must be at least 8 characters.'))
      return
    }

    setLoading(true)
    try {
      await register(form)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Start your ascent"
      subtitle="Create an account to start tracking your book."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="cursor-pointer font-semibold text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <ErrorState error={error} compact /> : null}

        <div>
          <label htmlFor="name" className="label">
            Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={form.name}
            onChange={update('name')}
            placeholder="Alex Chen"
            className="input"
          />
        </div>

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
            className="input"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={update('password')}
            placeholder="At least 8 characters"
            aria-describedby="password-hint"
            className="input"
          />
          <p id="password-hint" className="mt-1.5 text-xs text-text-secondary">
            Use at least 8 characters.
          </p>
        </div>

        <SubmitButton loading={loading} loadingLabel="Reaching new heights...">
          Create Account
        </SubmitButton>
      </form>
    </AuthShell>
  )
}
