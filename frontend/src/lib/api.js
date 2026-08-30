const BASE = '/api'

export const TOKEN_KEY = 'everest_token'
export const USER_KEY = 'everest_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach the Everest server. Is the backend running?', 0)
  }

  if (res.status === 401 && auth) {
    clearSession()
    // Full reload so every hook drops its stale state along with the session.
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new ApiError('Your session expired. Please log in again.', 401)
  }

  if (res.status === 204) return null

  const text = await res.text()

  /*
   * Parse defensively.
   *
   * `JSON.parse` used to run unguarded here, so any non-JSON body threw a raw
   * SyntaxError that propagated all the way to the UI as
   *
   *     Unexpected token 'I', "Internal S"... is not valid JSON
   *
   * That message describes OUR parser, not the failure, and it actively
   * misleads: it reads like a frontend bug when the server has 500'd. A body
   * we cannot parse is a server problem, and it must be reported as one.
   *
   * Non-JSON responses are not hypothetical even with the API's own handler in
   * place — a proxy 502, a dev-server error page, or a crash before any
   * application code runs all produce HTML or plain text.
   */
  let data = null
  let parseFailed = false
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      parseFailed = true
    }
  }

  if (parseFailed) {
    // Keep a short excerpt of the real body: it is what makes an unparseable
    // response diagnosable at all, and it goes to the console, not the user.
    console.error(
      `[api] Non-JSON response from ${method} ${path} (HTTP ${res.status}):`,
      text.slice(0, 300),
    )
    throw new ApiError(
      res.ok
        ? 'The server sent a response Everest could not read. Please try again.'
        : 'The Everest server hit an unexpected error. Please try again.',
      res.ok ? 502 : res.status,
    )
  }

  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : 'Something went wrong. Please try again.'
    throw new ApiError(message, res.status)
  }

  return data
}

export const api = {
  // auth
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),

  // market
  prices: (tickers) => request(`/prices?tickers=${encodeURIComponent(tickers.join(','))}`),
  history: (ticker, period) => request(`/prices/${ticker}/history?period=${period}`),
  profile: (ticker) => request(`/profile/${ticker}`),

  // portfolio
  portfolio: (mode) => request(`/portfolio${mode ? `?mode=${mode}` : ''}`),
  addPosition: (payload) => request('/portfolio', { method: 'POST', body: payload }),
  deletePosition: (id) => request(`/portfolio/${id}`, { method: 'DELETE' }),
  pnl: (mode) => request(`/pnl?mode=${mode}`),
  portfolioHistory: (mode, period) => request(`/portfolio/history?mode=${mode}&period=${period}`),

  // watchlist
  watchlist: () => request('/watchlist'),
  addWatchlist: (ticker) => request('/watchlist', { method: 'POST', body: { ticker } }),
  removeWatchlist: (id) => request(`/watchlist/${id}`, { method: 'DELETE' }),

  // news
  news: (ticker) => request(`/news/${ticker}`),

  // options
  options: ({ mode, ticker } = {}) => {
    const params = new URLSearchParams()
    if (mode) params.set('mode', mode)
    if (ticker) params.set('ticker', ticker)
    const qs = params.toString()
    return request(`/options${qs ? `?${qs}` : ''}`)
  },
  addOption: (payload) => request('/options', { method: 'POST', body: payload }),
  deleteOption: (id) => request(`/options/${id}`, { method: 'DELETE' }),

  // activity
  activity: (limit = 10) => request(`/activity?limit=${limit}`),

  // ai
  aiRuns: () => request('/ai/runs'),
  aiAnalyst: (mode) => request('/ai/analyst', { method: 'POST', body: { mode } }),
  aiThesis: (payload) => request('/ai/thesis', { method: 'POST', body: payload }),
  aiScreener: (payload) => request('/ai/screener', { method: 'POST', body: payload }),
  aiEarnings: (ticker) => request('/ai/earnings', { method: 'POST', body: { ticker } }),
  aiCompare: (tickers) => request('/ai/compare', { method: 'POST', body: { tickers } }),
  aiRisk: (mode) => request('/ai/risk', { method: 'POST', body: { mode } }),
}
