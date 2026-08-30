import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppLayout } from './components/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { RouteBoundary } from './components/RouteBoundary'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './hooks/useAuth'
import { ModeProvider } from './hooks/useMode'
import { ThemeProvider } from './hooks/useTheme'
import {
  AIInsights,
  Dashboard,
  Options,
  Portfolio,
  Settings,
  TickerDetail,
  Watchlist,
} from './lib/routes'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'

/**
 * ONE boundary, inside the shell, wrapping every lazy route.
 *
 * Previously every route had its own `<Suspense fallback={<LoadingScreen />}>`,
 * which replaced the entire page with a centred mountain and rotating copy
 * while a chunk downloaded — a full-page loading state on top of a shell that
 * was already rendered and perfectly usable. That was replaced with a bare
 * `fallback={null}`, which fixed the flashing but introduced a worse failure:
 * a chunk that stalled or never arrived left the content area blank FOREVER,
 * with no loading state, no error and no way back. A blank page is
 * indistinguishable from a broken app.
 *
 * RouteBoundary keeps the good part — nothing renders during the brief window
 * where a preloaded chunk resolves, so the sidebar, topbar and page chrome
 * stay put — and adds the two things that were missing: a real loading state
 * once the wait stops being brief, and an error boundary so a failed chunk or
 * a render error shows a retry instead of an empty screen.
 *
 * Keyed by pathname so a route that errored clears once you navigate away.
 */
function RouteSuspense({ children }) {
  const { pathname } = useLocation()
  return <RouteBoundary routeKey={pathname}>{children}</RouteBoundary>
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <ModeProvider>
              <Routes>
                <Route path="/" element={<Landing />} />

                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <Login />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicOnlyRoute>
                      <Register />
                    </PublicOnlyRoute>
                  }
                />

                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route
                    index
                    element={
                      <RouteSuspense>
                        <Dashboard />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="portfolio"
                    element={
                      <RouteSuspense>
                        <Portfolio />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="watchlist"
                    element={
                      <RouteSuspense>
                        <Watchlist />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="ticker/:symbol"
                    element={
                      <RouteSuspense>
                        <TickerDetail />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="ai"
                    element={
                      <RouteSuspense>
                        <AIInsights />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="options"
                    element={
                      <RouteSuspense>
                        <Options />
                      </RouteSuspense>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <RouteSuspense>
                        <Settings />
                      </RouteSuspense>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}
