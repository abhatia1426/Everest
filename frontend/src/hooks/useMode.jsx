import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const MODE_KEY = 'everest_mode'
const ModeContext = createContext(null)

/** Real vs Paper trading mode, shared by every /app route and persisted locally. */
export function ModeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem(MODE_KEY) || 'real')

  const setMode = useCallback((next) => {
    localStorage.setItem(MODE_KEY, next)
    setModeState(next)
  }, [])

  const value = useMemo(
    () => ({ mode, setMode, isPaper: mode === 'paper' }),
    [mode, setMode],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>')
  return ctx
}
