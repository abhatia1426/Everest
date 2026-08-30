import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  Bell,
  Briefcase,
  Eye,
  Layers,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react'

import { PeakIcon, Wordmark } from './Brand'
import { ModeToggle } from './Controls'
import { PageTransition } from './Motion'
import { CommandPalette } from './search/CommandPalette'
import { GlassCard } from './ui/GlassCard'
import { ThemeToggle } from './ui/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { SearchProvider, useSearchContext } from '../hooks/useSearch'
import { preloadLikelyRoutes, preloadRoute } from '../lib/routes'
import { WatchlistProvider } from '../hooks/useWatchlist'

const NAV_ITEMS = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/app/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/app/watchlist', label: 'Watchlist', icon: Eye },
  { to: '/app/ai', label: 'AI Insights', icon: Sparkles },
  { to: '/app/options', label: 'Options', icon: Layers },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/**
 * Responsive tiers:
 *   <768px    bottom nav, no sidebar
 *   768-1279  icon-only sidebar rail (76px)
 *   >=1280    full sidebar with labels (240px)
 */
const RAIL = 'w-[80px] xl:w-[252px]'

/** Topbar title for the current route. Falls back to the ticker symbol. */
function usePageTitle(pathname) {
  const exact = NAV_ITEMS.find((item) => item.to === pathname)
  if (exact) return exact.label === 'Home' ? 'Dashboard' : exact.label

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
    <button
      type="button"
      onClick={open}
      aria-label="Search stocks"
      aria-keyshortcuts="Meta+K Control+K"
      className="hidden items-center gap-2 rounded-lg border border-subtle bg-tint/[0.03] px-3
        py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-tint/[0.06]
        hover:text-text-primary lg:flex"
    >
      <Search size={15} />
      <span className="w-24 text-left">Search</span>
      <kbd className="rounded border border-subtle bg-tint/[0.05] px-1.5 py-0.5 text-[10px] font-semibold">
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
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
    <div className="min-h-screen">
      {/* ------------------------------------------------------ Sidebar */}
      <GlassCard
        as="aside"
        aria-label="Main navigation"
        className={`glass-chrome fixed inset-y-4 left-4 z-30 hidden md:block ${RAIL}`}
        contentClassName="h-full"
      >
        <div className="flex h-full w-full flex-col">
          {/* Brand + theme */}
          <div className="flex flex-col items-center gap-3 px-3 pt-5 xl:items-start xl:px-5">
            <div className="flex items-center gap-2.5">
              <PeakIcon size={22} className="shrink-0 text-accent" />
              <Wordmark size="text-lg" className="hidden xl:inline" />
            </div>
            <ThemeToggle showLabel={false} />
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-1.5 px-2.5 xl:px-3">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                // Start the destination's chunk downloading on intent, so the
                // click itself has nothing left to wait for.
                onMouseEnter={() => preloadRoute(to)}
                onFocus={() => preloadRoute(to)}
                className={({ isActive }) =>
                  // Rounded-control, not a full pill: at 44px tall a pill reads
                  // as a floating button, and six of them read as a toolbar
                  // rather than a nav.
                  `group flex min-h-[42px] items-center justify-center gap-3 rounded-control px-3
                   text-[13px] font-medium transition-colors duration-150 xl:justify-start xl:px-3.5 ${
                     isActive
                       ? 'bg-accent/12 text-accent'
                       : 'text-text-secondary hover:bg-tint/[0.05] hover:text-text-primary'
                   }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.3 : 1.8} className="shrink-0" />
                    <span className="hidden xl:inline">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User + logout */}
          <div className="border-t p-3">
            <div className="flex items-center justify-center gap-3 rounded-xl px-1 py-1.5 xl:justify-start xl:px-2">
              <Avatar name={user?.name} />
              <div className="hidden min-w-0 flex-1 xl:block">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {user?.name || 'Climber'}
                </p>
                <p className="truncate text-xs text-text-secondary">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
                className="hidden h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg
                  text-text-secondary transition-colors duration-150 hover:bg-down/10
                  hover:text-down xl:grid"
              >
                <LogOut size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="mx-auto mt-2 grid h-10 w-10 cursor-pointer place-items-center rounded-lg
                text-text-secondary transition-colors duration-150 hover:bg-down/10
                hover:text-down xl:hidden"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ------------------------------------------------------- Topbar */}
      <div className="px-[var(--space-page)] pt-4 md:pl-[100px] xl:pl-[276px]">
        <GlassCard
          as="header"
          className="glass-chrome sticky top-4 z-20 px-4 py-3 sm:px-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="md:hidden">
                <PeakIcon size={20} className="text-accent" />
              </span>
              <h1 className="t-page-title truncate">{title}</h1>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <SearchTrigger />
              <ModeToggle />
              <button
                type="button"
                aria-label="Notifications"
                title="Notifications"
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full
                  text-text-secondary transition-colors duration-150 hover:bg-tint/[0.06]
                  hover:text-text-primary"
              >
                <Bell size={17} />
              </button>
              <Avatar name={user?.name} size={36} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* --------------------------------------------------------- Main */}
      <main className="px-[var(--space-page)] pb-28 pt-5 md:pb-10 md:pl-[100px] xl:pl-[276px]">
        {/*
          NO mode="wait". It made AnimatePresence hold the incoming route until
          the outgoing one finished its 300ms exit — so every navigation had a
          third of a second during which the new page did not exist, could not
          render its shell, and had not started fetching. Cross-fading in place
          is both faster and less distracting.
        */}
        <AnimatePresence initial={false}>
          <PageTransition key={pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* ---------------------------------- Mobile bottom nav (<768px) */}
      <GlassCard
        as="nav"
        aria-label="Primary"
        className="glass-chrome fixed inset-x-4 bottom-4 z-30 md:hidden"
      >
        <div
          className="mx-auto flex max-w-lg items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV_ITEMS.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onTouchStart={() => preloadRoute(to)}
              className={({ isActive }) =>
                `flex min-h-[56px] min-w-[56px] flex-1 cursor-pointer flex-col items-center
                 justify-center gap-1 px-1 py-2 text-[10px] font-semibold
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
        <AppShell />
      </WatchlistProvider>
    </SearchProvider>
  )
}

/**
 * In-page header for a route's own content. The route name now lives in the
 * topbar, so this carries the subtitle and any page-level actions.
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
