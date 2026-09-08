/**
 * The inventory of what Everest keeps in this browser.
 *
 * WHY THIS EXISTS: seven localStorage keys are written from six different
 * modules — `useTheme`, `useMode`, `lib/api`, `useSearch`, `useFavorites`,
 * `lib/logos` and the AI Insights page. Settings has to describe and clear
 * them, and a Settings page that keeps its OWN list of key names is a list
 * that goes stale the first time a hook is renamed.
 *
 * So the descriptors below are the one place the key strings are stated for
 * presentation, and every entry names the module that actually writes it. If
 * a key moves, this file is the single thing to update.
 *
 * SAFETY: `clearable` is not a styling flag. Three of these keys are load-
 * bearing — the session pair signs you in, and theme/mode decide what the app
 * paints before React runs. None of them get a "Clear" button in the per-key
 * list, because a control that silently logs you out while you are reading a
 * paragraph about local preferences is the exact failure this screen must not
 * have. Session clearing has one route only: Log out, which says so.
 */

/** Keys that hold the session. Kept separate — several call sites care. */
export const SESSION_KEYS = ['everest_token', 'everest_user']

/**
 * Every key Everest writes to localStorage, in the order Settings lists them:
 * the three it needs first, then the four that are pure convenience.
 *
 * @typedef {object} LocalStore
 * @property {string}   id        stable identifier, used by `clearStore`
 * @property {string}   label     user-facing name
 * @property {string[]} keys      the literal localStorage keys
 * @property {string}   detail    what it stores, in the user's terms
 * @property {boolean}  clearable whether a per-key Clear button is offered
 * @property {string}   note      why it cannot be cleared here (when it cannot)
 */
export const LOCAL_STORES = [
  {
    id: 'theme',
    label: 'Theme',
    keys: ['everest_theme'],
    detail: 'Light or dark, read before first paint so the app never flashes the wrong theme.',
    clearable: false,
    note: 'Everest reads this before React starts. Change it in Appearance instead.',
  },
  {
    id: 'mode',
    label: 'Portfolio mode',
    keys: ['everest_mode'],
    detail: 'Whether this browser opens in your real or paper portfolio.',
    clearable: false,
    note: 'Change it in Portfolio mode instead. Clearing it would silently return you to Real.',
  },
  {
    id: 'session',
    label: 'Session',
    keys: SESSION_KEYS,
    detail: 'Your signed token and the name and email shown in the header. Removed when you log out.',
    clearable: false,
    note: 'Removing this signs you out, so it belongs to Log out — not to a row about preferences.',
  },
  {
    id: 'ai-history',
    label: 'Saved AI runs',
    keys: ['everest_ai_history'],
    detail: 'The analyses you have run, kept locally so they survive a reload. Never uploaded.',
    clearable: true,
  },
  {
    id: 'recents',
    label: 'Recent searches',
    keys: ['everest_recent_tickers'],
    detail: 'Symbols you looked up recently, offered when the search palette opens empty.',
    clearable: true,
  },
  {
    id: 'pinned',
    label: 'Pinned watchlist names',
    keys: ['everest.watchlist.pinned'],
    detail:
      'Which tracked names sit at the top of your watchlist. Pinning is browser-local; the watchlist itself is on the server.',
    clearable: true,
  },
  {
    id: 'logos',
    label: 'Cached company logos',
    keys: ['everest.logos.v1'],
    detail: "Resolved logo URLs, so a ticker's mark does not flicker on every visit.",
    clearable: true,
  },
]

/** Every key in the inventory, session included. */
export function allLocalKeys() {
  return LOCAL_STORES.flatMap((store) => store.keys)
}

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    // Safari in private mode, or storage disabled entirely. A Settings page
    // that throws while describing storage is worse than one that says 0 B.
    return null
  }
}

/**
 * Approximate size of a store, in characters of stored JSON.
 *
 * Characters, not bytes: localStorage holds UTF-16 and browsers do not expose
 * a per-key byte count. For an inventory whose job is "is this 300 bytes or
 * 300 kilobytes", the distinction does not change a decision, and the label
 * says "approximate".
 */
export function storeSize(store) {
  return store.keys.reduce((total, key) => total + (read(key)?.length ?? 0), 0)
}

/** Whether a store currently holds anything at all. */
export function storeIsEmpty(store) {
  return store.keys.every((key) => read(key) === null)
}

export function formatSize(chars) {
  if (chars <= 0) return 'empty'
  if (chars < 1024) return `${chars} B`
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`
}

function remove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage unavailable — nothing to remove */
  }
}

/**
 * Clear one store by id.
 *
 * Refuses anything not marked `clearable`, so a future caller cannot reach
 * the session pair through this function by passing the wrong id.
 */
export function clearStore(id) {
  const store = LOCAL_STORES.find((entry) => entry.id === id)
  if (!store || !store.clearable) return false
  store.keys.forEach(remove)
  return true
}

/**
 * Clear every key in the inventory, session included.
 *
 * This DOES sign the user out, and the only control wired to it says so
 * before it runs. It touches localStorage only: positions, options and
 * watchlist rows live on the Everest server against the account and are not
 * affected, which is why signing back in restores them.
 */
export function clearAllLocalData() {
  allLocalKeys().forEach(remove)
}
