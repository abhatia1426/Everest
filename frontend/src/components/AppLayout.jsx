import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Briefcase,
  Eye,
  Layers,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react'

import { ModeToggle } from './Controls'
import { MarketRail } from './MarketRail'
import { PageTransition, useMotionSafe } from './Motion'
import { CommandPalette } from './search/CommandPalette'
import { GlassCard } from './ui/GlassCard'
import { ThemeToggle } from './ui/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { BookStateProvider } from '../hooks/useBookState'
import { SearchProvider, useSearchContext } from '../hooks/useSearch'
import { preloadLikelyRoutes, preloadRoute } from '../lib/routes'
import { WatchlistProvider } from '../hooks/useWatchlist'

/**
 * Order and labels are the approved shell's, identical in all seven design
 * files: Dashboard, Portfolio, Watchlist, Options, AI Insights, Settings.
 *
 * Options now precedes AI Insights (it previously followed), and the first
 * item is labelled "Dashboard" rather than "Home" — the designs name the
 * destination, and the route's own page title said "Dashboard" anyway, so the
 * nav and the page were disagreeing about the same screen.
 */
const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/app/watchlist', label: 'Watchlist', icon: Eye },
  { to: '/app/options', label: 'Options', icon: Layers },
  { to: '/app/ai', label: 'AI Insights', icon: Sparkles },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/**
 * Responsive tiers:
 *   <768px    bottom nav; top chrome carries brand + controls only
 *   >=768px   horizontal nav in the top chrome, no sidebar
 */

/** Page name for the current route. Falls back to the ticker symbol. */
function usePageTitle(pathname) {
  const exact = NAV_ITEMS.find((item) => item.to === pathname)
  if (exact) return exact.label

  const ticker = pathname.match(/^\/app\/ticker\/([^/]+)$/)
  if (ticker) return decodeURIComponent(ticker[1]).toUpperCase()

  return 'Dashboard'
}

function initialsOf(name) {
  return (name || 'EV')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/**
 * The AUTHENTICATED lockup, transcribed from `Everest Dashboard v2.dc.html`
 * rather than approximated:
 *
 *   tile      30x30, `border-radius:9px`, `linear-gradient(160deg,brand,brand-2)`
 *   glyph     16x16 on a `0 0 20 20` viewBox, solid white, no negative space
 *   gap       10px, then `padding-right:6px` on the group
 *   wordmark  Archivo 700 / 18px / -0.03em, title case, baseline-aligned by
 *             `align-items:center` on the row
 *
 * The glyph is the design's own twin-summit silhouette. It is NOT the shared
 * `EverestMark`: that mark is a 24-viewBox notched triangle with evenodd
 * negative space, which at 16px inside a 30px tile reads as a different shape
 * at a different optical weight than the approved shell draws. Brand.jsx is
 * untouched, so the frozen landing keeps the mark it was designed against —
 * this path exists only inside the product chrome.
 */
function AuthMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2 16.4L7.9 4l3.4 7.1L13.5 7l4.5 9.4H2z" fill="#fff" />
    </svg>
  )
}

function BrandLockup() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 pr-1.5">
      <span
        className="grid h-[30px] w-[30px] shrink-0 place-items-center"
        style={{
          borderRadius: 9,
          // 160deg, per the design. `--brand-gradient` is 150deg and is shared
          // with the landing, so the angle is stated here rather than changed
          // in a token the frozen page also reads.
          background: 'linear-gradient(160deg, var(--accent-blue), var(--brand-2))',
        }}
        aria-hidden="true"
      >
        <AuthMark size={16} />
      </span>
      <span className="hidden font-display text-[18px] font-bold tracking-[-0.03em] text-text-primary sm:inline">
        Everest
      </span>
    </div>
  )
}

function Avatar({ name, size = 32 }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-bold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}

/**
 * Opens the command palette rather than being its own input — one search
 * surface, one set of keyboard rules.
 */
function SearchTrigger() {
  const { open } = useSearchContext()
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search stocks"
        aria-keyshortcuts="Meta+K Control+K"
        className="glass-button hidden py-[9px] pl-4 pr-2.5 text-[12.5px] lg:inline-flex"
      >
        <Search size={15} />
        <span className="w-16 text-left">Search</span>
        <kbd
          className="rounded-full px-1.5 py-1 text-[10.5px] font-semibold"
          style={{ background: 'rgb(var(--tint) / 0.08)' }}
        >
          {isMac ? '⌘' : 'Ctrl'}K
        </kbd>
      </button>

      {/* Below lg the labelled trigger costs more width than it earns. */}
      <button
        type="button"
        onClick={open}
        aria-label="Search stocks"
        className="glass-button h-9 w-9 lg:hidden"
      >
        <Search size={16} />
      </button>
    </>
  )
}

/**
 * Horizontal primary nav.
 *
 * Text, not pills. Six pills across the top read as a toolbar of buttons; six
 * words with a single 2px underline read as navigation, which is what these
 * are. The underline is one shared element that slides between items via
 * `layoutId` — the only shared-element move in the shell, and the reason the
 * active route reads as a position rather than as a repainted background.
 */
/**
 * Primary navigation as a glass capsule with a solid sliding chip.
 *
 * An underline on bare text is website chrome. Containing the six destinations
 * inside one blurred track — and marking the current one with an opaque chip
 * that physically slides — turns navigation into an app control: it reads as a
 * single object with a current position rather than as six links.
 */
function TopNav() {
  const animateOn = useMotionSafe()

  return (
    /*
     * Shown only at >=1181px, matching the approved shell's own breakpoint
     * (`@media (max-width:1180px){[data-nav]{display:none}}`).
     *
     * It previously appeared from 768px up and scrolled horizontally when it
     * did not fit. At ~940px that silently pushed "Settings" outside the track
     * with no scroll affordance, so the route looked absent rather than
     * scrolled — and the bottom nav that would otherwise carry it was itself
     * hidden above 768px. Settings was unreachable through navigation on every
     * width between 768 and 1180.
     */
    <nav
      aria-label="Main navigation"
      className="pill-track hidden min-w-0 min-[1181px]:inline-flex"
    >
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          // Start the destination's chunk downloading on intent, so the click
          // itself has nothing left to wait for.
          onMouseEnter={() => preloadRoute(to)}
          onFocus={() => preloadRoute(to)}
          className={({ isActive }) =>
            `pill-item shrink-0 px-[15px] py-2 text-[13.5px] ${
              isActive ? '' : 'hover:!text-text-primary'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <motion.span
                  layoutId={animateOn ? 'nav-chip' : undefined}
                  // Brand-accented, per the approved shell. The chip moved
                  // from an opaque white slab to Everest blue: blue is the
                  // brand/active-selection colour in the semantic system, and
                  // "which route am I on" is the canonical active selection.
                  className="pill-thumb pill-thumb-accent"
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className="relative"
                style={isActive ? { color: 'var(--brand-ink)' } : undefined}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = usePageTitle(pathname)

  // Warm the likely next destinations once the shell is idle.
  useEffect(() => {
    preloadLikelyRoutes()
  }, [])

  const handleLogout = () => {
    logout()
    // Land on the public landing page, not the login form.
    navigate('/', { replace: true })
  }

  return (
    // `app-theme` re-declares the surface and text ramps as neutral graphite
    // for the product only, leaving the landing on the original blue-hour
    // palette it was designed against.
    /*
     * EDGE TO EDGE.
     *
     * An earlier pass floated the whole product inside a rounded island with a
     * black perimeter. It photographs well and works badly: the application
     * looked smaller than the window it was in, and the dead margin read as a
     * presentation mockup rather than software. The canvas now IS the page.
     *
     * Everything that made the framing feel designed is kept and moved inward:
     * rounded modules, layered surfaces, glass chrome. Only the outer box and
     * its margin are gone.
     */
    <div
      className="app-theme min-h-screen"
      style={{ background: 'var(--frame-canvas)' }}
    >
      <div>
        <div>
          {/* ------------------------------------------ Two-tier top chrome */}
          <header
            className="glass-chrome sticky top-0 z-30"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="px-[18px]">
              {/* Tier 1 — identity, navigation, account */}
              {/* 76px, not 68. The approved shell gives the bar real presence:
                  a 26px mark, a 40px nav track and 38px controls do not sit
                  comfortably in 68px, and the whole chrome read compressed
                  against the 20px surfaces below it. */}
              {/* Design: `padding:14px 18px 10px`, `gap:14px`, 36px controls. */}
              <div className="flex items-center gap-3.5 pb-2.5 pt-3.5">
                <BrandLockup />

                <TopNav />

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <SearchTrigger />
                  <ModeToggle />
                  {/* Below sm the chrome cannot fit brand, search, Real/Paper,
                      theme AND the account control — the avatar was being
                      clipped at the frame edge. Theme also lives in Settings. */}
                  <span className="hidden sm:inline-flex">
                    <ThemeToggle showLabel={false} />
                  </span>
                  {/*
                    The notifications bell is gone.

                    It rendered a button with no handler and no notification
                    system behind it — an affordance the interface could not
                    honour. None of the seven approved designs draw one, and
                    Everest has no notifications capability to wire it to, so
                    it is removed rather than restyled.
                  */}

                  {/*
                    ACCOUNT CONTROL — the design's geometry exactly:
                    `padding:4px 12px 4px 4px`, 999px radius, 28px avatar,
                    8px gap, label 12.5px/600, nowrap.

                    The design's label reads "Individual · 8471". Everest has
                    no account type and no account number, so that string can
                    only be typed in — the control keeps its shape and carries
                    the one identity the product actually holds: the signed-in
                    user's name. Below 760px the design drops the label and
                    collapses the padding to 4px; that behaviour is kept.
                  */}
                  <span
                    className="glass-control flex items-center rounded-full"
                    style={{ gap: 8, padding: '4px 12px 4px 4px' }}
                  >
                    <Avatar name={user?.name} size={28} />
                    <span className="hidden whitespace-nowrap text-[12.5px] font-semibold text-text-primary min-[761px]:inline">
                      {user?.name || user?.email || 'Signed in'}
                    </span>
                    <button
                      type="button"
                      onClick={handleLogout}
                      aria-label="Log out"
                      title="Log out"
                      className="grid h-5 w-5 cursor-pointer place-items-center rounded-full
                        text-text-tertiary transition-colors duration-150 hover:text-down"
                    >
                      <LogOut size={14} />
                    </button>
                  </span>
                </div>
              </div>

              {/* Tier 2 — page + market context. One quiet line, not a navbar. */}
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <MarketRail title={title} />
              </div>
            </div>
          </header>

          {/* ----------------------------------------------------- Main */}
          {/* Bottom padding clears the floating bottom nav, which now persists
              up to 1180px — so the reduced padding has to start there too, or
              content sits underneath it between 768 and 1180. */}
          <main className="px-[18px] pb-28 pt-2 min-[1181px]:pb-[18px]">
            {/*
              NO mode="wait". It made AnimatePresence hold the incoming route
              until the outgoing one finished its 300ms exit — so every
              navigation had a third of a second during which the new page did
              not exist, could not render its shell, and had not started
              fetching. Cross-fading in place is both faster and less
              distracting.
            */}
            <AnimatePresence initial={false}>
              <PageTransition key={pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* ---------------------------------- Mobile bottom nav (<768px) */}
      <GlassCard
        as="nav"
        aria-label="Primary"
        // Takes over exactly where the top nav stops (<=1180px), so there is
        // no width at which the product has no visible navigation.
        className="glass-chrome fixed inset-x-4 bottom-4 z-30 min-[1181px]:hidden"
      >
        <div
          className="mx-auto flex max-w-xl items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/*
            ALL SIX, not the first five.

            The bottom nav rendered `slice(0, 5)`, which dropped whichever
            route sorted last — Settings — so on small screens it could not be
            reached at all. Six 48px targets fit inside the narrowest viewport
            we support once the 16px insets are accounted for, and 48x56
            clears the 44px minimum touch target comfortably.
          */}
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onTouchStart={() => preloadRoute(to)}
              className={({ isActive }) =>
                `flex min-h-[56px] min-w-[48px] flex-1 cursor-pointer flex-col items-center
                 justify-center gap-1 px-0.5 py-2 text-center text-[10px] font-semibold leading-tight
                 transition-colors duration-150 ${
                   isActive ? 'text-accent' : 'text-text-secondary'
                 }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </GlassCard>

      <CommandPalette />
    </div>
  )
}

export function AppLayout() {
  return (
    <SearchProvider>
      <WatchlistProvider>
        <BookStateProvider>
          <AppShell />
        </BookStateProvider>
      </WatchlistProvider>
    </SearchProvider>
  )
}

/**
 * In-page header for a route's own content. The route name now lives in the
 * chrome, so this carries the subtitle and any page-level actions.
 */
export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {title ? (
          <div className="flex items-center gap-2.5">
            {Icon ? <Icon size={18} className="text-accent" strokeWidth={2} /> : null}
            <h2 className="t-section">{title}</h2>
          </div>
        ) : null}
        {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
