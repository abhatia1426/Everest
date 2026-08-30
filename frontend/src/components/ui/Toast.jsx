import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

const DEFAULT_DURATION = 4000
const EASE = [0.16, 1, 0.3, 1]

const TONES = {
  success: { icon: CheckCircle2, ring: 'border-up/30', accent: 'text-up', bar: 'bg-up' },
  error: { icon: XCircle, ring: 'border-down/30', accent: 'text-down', bar: 'bg-down' },
  warning: { icon: AlertTriangle, ring: 'border-warn/30', accent: 'text-warn', bar: 'bg-warn' },
  info: { icon: Info, ring: 'border-accent/30', accent: 'text-accent', bar: 'bg-accent' },
}

function ToastCard({ toast, onDismiss }) {
  const tone = TONES[toast.tone] || TONES.info
  const Icon = tone.icon
  const reduceMotion = useReducedMotion()

  return (
    <motion.li
      layout
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: 0.24, ease: EASE }}
      className={`pointer-events-auto relative w-[min(92vw,380px)] overflow-hidden rounded-panel
        border ${tone.ring}`}
      style={{
        background: 'var(--chrome-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
      }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <Icon size={17} className={`mt-0.5 shrink-0 ${tone.accent}`} />
        <div className="min-w-0 flex-1">
          {toast.title ? (
            <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
          ) : null}
          {toast.description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg
            text-text-secondary transition-colors duration-150 hover:bg-tint/[0.06]
            hover:text-text-primary"
        >
          <X size={13} />
        </button>
      </div>

      {/* Progress bar doubles as the auto-dismiss countdown. */}
      {toast.duration > 0 && !reduceMotion ? (
        <motion.span
          className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${tone.bar} opacity-50`}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
        />
      ) : null}
    </motion.li>
  )
}

/**
 * Stacked, auto-dismissing notifications.
 *
 * Mounted once at the app root so any screen — including the auth pages
 * outside the app shell — can raise one. Timers are held in a ref keyed by id
 * so a manual dismiss also cancels its pending auto-dismiss.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    ({ tone = 'info', title, description, duration = DEFAULT_DURATION }) => {
      const id = `${tone}-${Math.random().toString(36).slice(2)}`
      // Cap the stack so a burst of errors cannot cover the screen.
      setToasts((current) => [...current.slice(-3), { id, tone, title, description, duration }])

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      toast: push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description, duration: 6000 }),
      warning: (title, description) => push({ tone: 'warning', title, description, duration: 6000 }),
      info: (title, description) => push({ tone: 'info', title, description }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <ul
          aria-label="Notifications"
          // Below md the mobile bottom nav owns the lower edge, so sit above it.
          className="pointer-events-none fixed inset-x-4 bottom-24 z-[70] flex flex-col items-end
            gap-2 md:inset-x-auto md:bottom-6 md:right-6"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <AnimatePresence initial={false}>
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </ul>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
