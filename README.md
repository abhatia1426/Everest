# Everest

**Trade smarter. Climb higher.**

Everest is a full-stack stock trading tracker: real and paper portfolios, options positions, a live watchlist, news sentiment, and four Gemini-powered analysis tools — behind a single dark, data-dense interface.

---

## Features

### Landing page (`/`)
A public marketing page with a full-bleed immersive hero: a deep-navy radial gradient, three slow-drifting blurred colour orbs, and a floating glass dashboard mockup with a blue glow. Below it sit a social-proof strip, a 3x2 feature grid, a browser-chrome product preview, an AI spotlight row, a gradient CTA banner and the footer. Every section reveals on scroll via IntersectionObserver.

### Light and dark themes
The whole app is themed through CSS custom properties driven by `[data-theme]` on `<html>`. Preference is stored in `localStorage` and applied before first paint so there is no flash of the wrong theme. A custom pill toggle lives in the sidebar, the landing navbar and Settings. The landing hero is intentionally fixed dark in both themes; the product-preview section follows the toggle.

### Auth
Email/password registration and login. Passwords are hashed with `passlib` (bcrypt) and stored in MongoDB; the API returns a JWT that the frontend keeps in `localStorage`. Every `/app/*` route is gated and redirects to `/login` without a valid token.

### Portfolio tracking
Positions with ticker, quantity and average cost, valued against live Finnhub quotes. Market value, cost basis, unrealized P&L and percent change are computed per position and in aggregate. Repeat buys of the same symbol average into the existing lot rather than creating duplicate rows.

### Paper trading
Every position and option carries a `real` or `paper` mode. A pill toggle in the navbar switches the whole app between the two books; they are stored and reported completely separately.

### Options
Calls and puts with strike, expiry, contracts and average cost. Estimated value uses intrinsic value plus a linear time premium (directional, not a pricing model). Days-to-expiry is badged green above 30 days, amber from 8–30, red at 7 or fewer.

### Watchlist
A grid of ticker cards with price, percent change, sector and a 7-day sparkline, refreshing every 30 seconds. "Screen with AI" ranks the whole list against an investing style.

### News sentiment
Ten recent articles per ticker from NewsAPI, each tagged positive / neutral / negative by a financial-headline lexicon, with a sentiment breakdown across the set.

### AI tools (Gemini `gemini-3.6-flash`)
All four return structured JSON validated against a response schema, so the UI renders real components rather than parsing prose.

| Tool | Endpoint | What it produces |
|---|---|---|
| **Portfolio Analyst** | `POST /ai/analyst` | Sector concentration, risk flags, top performers, detractors |
| **Trade Thesis** | `POST /ai/thesis` | Bull case, bear case, key risks, 1–10 confidence — grounded in live quotes and recent headlines |
| **Watchlist Screener** | `POST /ai/screener` | Ranked list with per-ticker score, rationale and verdict for a growth / value / momentum / dividend style |
| **Earnings Prep** | `POST /ai/earnings` | Analyst expectations, last quarter recap, metrics to watch, catalysts |

Each panel remembers its last run and shows a relative timestamp.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, lightweight-charts, framer-motion, lucide-react |
| Backend | FastAPI, Motor (async MongoDB), PyJWT, passlib |
| Market data | Finnhub (quotes) · Twelve Data (history) |
| News | newsdata.io or newsapi.org (auto-detected) |
| Logos | Logo.dev (with monogram fallback) |
| AI | Google Gemini (`gemini-3.6-flash`) |
| Database | MongoDB (`everest`) |

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB running locally (or a MongoDB Atlas connection string)

### 1. Clone and configure

There are **two** env files, and the split matters. Vite only reads env files from the
frontend project root and only exposes `VITE_`-prefixed variables to the browser. A
frontend variable placed in `backend/.env` is silently ignored — no error, it just never
loads. (That exact mistake is why company logos showed monograms for a while.)

```bash
cd everest
cp .env.example backend/.env     # then delete the frontend block from it
cp .env.example frontend/.env    # then delete the backend block from it
```

**`backend/.env`** — server-side only, never reaches the browser:

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Signs login tokens |
| `FINNHUB_API_KEY` | yes | Live quotes, profiles, fundamentals — [finnhub.io](https://finnhub.io), 60 calls/min free |
| `TWELVEDATA_API_KEY` | no | Historical candles — [twelvedata.com](https://twelvedata.com), 800 credits/day free |
| `NEWS_API_KEY` | no | Company headlines — [newsdata.io](https://newsdata.io) or [newsapi.org](https://newsapi.org) |
| `NEWS_PROVIDER` | no | Forces `newsdata` or `newsapi`; otherwise detected from the key's shape |
| `GEMINI_API_KEY` | no | The six AI research tools — [Google AI Studio](https://aistudio.google.com/apikey) |

**`frontend/.env`** — compiled into the browser bundle, so publishable keys only:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_LOGO_TOKEN` | no | Company logos — [logo.dev](https://logo.dev) publishable key (`pk_...`) |

Generate a `JWT_SECRET` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Everything except `MONGO_URI`, `JWT_SECRET` and `FINNHUB_API_KEY` is optional. Each
missing key degrades exactly one feature to a clear empty state rather than failing the
page: no history key means charts are empty but quotes and valuations still work; no logo
token means brand-coloured monograms instead of real marks.

**Check your configuration** at any time — it reports what is set and whether each key
looks right, and never prints a key:

```bash
curl http://localhost:8000/health/providers
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API listens on `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the backend, so no CORS configuration is needed in development.

### 4. First run

Register an account at `/register`, then add a position from `/app/portfolio` or a ticker from `/app/watchlist`.

---

## API reference

All routes except `/auth/register`, `/auth/login` and `/health` require an `Authorization: Bearer <token>` header.

### Auth
- `POST /auth/register` — `{ name, email, password }` → `{ token, user }`
- `POST /auth/login` — `{ email, password }` → `{ token, user }`
- `GET /auth/me` — current user

### Market
- `GET /prices?tickers=AAPL,MSFT` — price, change, % change, volume, market cap, P/E, 52w range
- `GET /prices/{ticker}/history?period=1w` — OHLCV candles; `period` ∈ `1h, 1d, 1w, 1m, 3m, 6m, 1y, all`
- `GET /profile/{ticker}` — company name, sector, industry, summary

### Portfolio
- `GET /portfolio?mode=real` — positions enriched with live P&L
- `POST /portfolio` — `{ ticker, qty, avg_cost, mode, type }`
- `DELETE /portfolio/{id}`
- `GET /pnl?mode=real` — totals, day change, sector allocation, per-position breakdown
- `GET /portfolio/history?mode=real&period=1m` — portfolio value over time

### Watchlist
- `GET /watchlist` · `POST /watchlist` (`{ ticker }`) · `DELETE /watchlist/{id}`

### News
- `GET /news/{ticker}` — 10 articles with a sentiment tag and score each

### Options
- `GET /options?mode=real&ticker=AAPL` · `POST /options` · `DELETE /options/{id}`

### AI
- `POST /ai/analyst` · `POST /ai/thesis` · `POST /ai/screener` · `POST /ai/earnings` · `GET /ai/runs`

---

## Project structure

```
everest/
├── backend/
│   ├── main.py              # FastAPI app, CORS, router registration
│   ├── config.py            # env loading, Mongo client, index setup
│   ├── routers/             # auth, prices, portfolio, watchlist, news, options, ai
│   ├── models/              # Pydantic schemas
│   ├── services/            # market layer, news, sentiment, gemini
│   │   └── providers/       # finnhub, twelvedata, newsdata, newsapi.org
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/           # Landing, Login, Register, app/*
│   │   ├── components/      # layout, charts, modals, states, AI renderers
│   │   ├── hooks/           # useAuth, useMode, useApi, useAssetSearch
│   │   └── lib/             # api client, cache, quotes, logos, formatters
│   └── vite.config.js
├── .env.example
└── README.md
```

---

## Design notes

- **Glass surfaces.** Every card is a frosted `GlassCard` built purely from CSS variables, so one component renders correctly in both themes with no conditional logic.
- **Colour is never the only signal.** P&L carries a sign and a number alongside green/red; sentiment badges pair a dot with a word; confidence is a meter with a numeric label.
- **Motion has meaning.** Route changes cross-fade, dashboard cards stagger in, the portfolio total counts up once on mount, and landing sections reveal on scroll. All of it collapses under `prefers-reduced-motion`.
- **Honest empty and degraded states.** When the market-data provider is unavailable the dashboard shows a dash and says so, rather than valuing every holding at zero and reporting a fake total loss.
- **Accessibility.** Focus rings are restyled but never removed, dialogs trap focus and restore it on close, tables and tabs use proper roles, and mobile navigation targets clear 44 px.
- **Responsive.** Sidebar on desktop, bottom nav with safe-area padding on mobile; wide tables scroll inside their own container so the page body never does.

---

## Notes and limitations

- **Quotes** come from Finnhub. Every price carries provenance (`live`, `delayed`, `cached`, `unavailable`) and the UI labels anything that is not live. Everest never substitutes cost basis for a market price without saying so.
- **Historical candles require `TWELVEDATA_API_KEY`.** Finnhub's free tier does not include `/stock/candle` (it returns HTTP 403), so without a Twelve Data key the Stock Detail chart, the Dashboard performance chart and watchlist sparklines render empty states. Nothing else is affected.
- Quotes are cached for 15 seconds and served stale-while-revalidate for up to 10 minutes; a circuit breaker backs off after repeated provider failures so an outage costs milliseconds rather than seconds.
- Option values are estimates, not chain-derived prices.
- Portfolio history applies current quantities backwards over historical prices — a "what would this basket have been worth" view, not a transaction-level reconstruction.
- AI output is generated analysis, not financial advice.

---

Built for traders who think ahead.
