import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { TOKEN_KEY, USER_KEY } from './api'
import {
  LOCAL_STORES,
  SESSION_KEYS,
  allLocalKeys,
  clearAllLocalData,
  clearStore,
  formatSize,
  storeIsEmpty,
  storeSize,
} from './localData'

/* Every .js/.jsx under src, so the inventory can be checked against the code
 * that actually writes the keys rather than against itself. */
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, acc)
    else if (/\.jsx?$/.test(entry.name) && !entry.name.includes('.test.')) acc.push(path)
  }
  return acc
}

const SRC = join(globalThis.process.cwd(), 'src')
const SOURCE = sourceFiles(SRC)
  .filter((path) => !path.endsWith('localData.js'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

/*
 * This project's jsdom environment ships without a Storage implementation —
 * `lib/logos` guards on `typeof localStorage === 'undefined'` for the same
 * reason. The module under test is all about storage, so it gets a real
 * in-memory one rather than a set of no-ops that would make every assertion
 * vacuously pass.
 */
function installStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
}

describe('local data inventory', () => {
  beforeEach(() => {
    installStorage()
  })

  it('names only keys the app actually writes', () => {
    // The drift guard. A key renamed in a hook must fail here rather than
    // leave Settings describing storage that no longer exists.
    for (const key of allLocalKeys()) {
      expect(SOURCE, `${key} is listed in Settings but written nowhere`).toContain(`'${key}'`)
    }
  })

  it('lists every localStorage key the app writes', () => {
    const written = new Set()
    for (const match of SOURCE.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*'([^']+)'/g)) {
      written.add(match[1])
    }
    // `everestLogoDebug` is a developer-only diagnostic flag, never set by the
    // product, so it is deliberately not surfaced as user-facing storage.
    written.delete('everestLogoDebug')

    const inventory = new Set(allLocalKeys())
    for (const key of written) {
      expect(inventory.has(key), `${key} is written but missing from Settings`).toBe(true)
    }
  })

  it('tracks the session keys the api module owns', () => {
    expect(SESSION_KEYS).toEqual([TOKEN_KEY, USER_KEY])
  })

  it('never offers a Clear button for load-bearing keys', () => {
    const clearable = LOCAL_STORES.filter((store) => store.clearable).flatMap((s) => s.keys)
    for (const key of [...SESSION_KEYS, 'everest_theme', 'everest_mode']) {
      expect(clearable).not.toContain(key)
    }
  })

  it('gives every non-clearable store a reason', () => {
    for (const store of LOCAL_STORES) {
      if (!store.clearable) expect(store.note).toBeTruthy()
    }
  })

  it('measures a store from what is stored', () => {
    const logos = LOCAL_STORES.find((store) => store.id === 'logos')
    expect(storeSize(logos)).toBe(0)
    expect(storeIsEmpty(logos)).toBe(true)

    localStorage.setItem('everest.logos.v1', '0123456789')
    expect(storeSize(logos)).toBe(10)
    expect(storeIsEmpty(logos)).toBe(false)
  })

  it('sums the keys of a multi-key store', () => {
    const session = LOCAL_STORES.find((store) => store.id === 'session')
    localStorage.setItem(TOKEN_KEY, 'abc')
    localStorage.setItem(USER_KEY, 'defgh')
    expect(storeSize(session)).toBe(8)
  })

  it('formats sizes at each scale', () => {
    expect(formatSize(0)).toBe('empty')
    expect(formatSize(5)).toBe('5 B')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('clears a clearable store', () => {
    localStorage.setItem('everest_recent_tickers', '["AAPL"]')
    expect(clearStore('recents')).toBe(true)
    expect(localStorage.getItem('everest_recent_tickers')).toBeNull()
  })

  it('refuses to clear the session through clearStore', () => {
    localStorage.setItem(TOKEN_KEY, 'jwt')
    expect(clearStore('session')).toBe(false)
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt')
  })

  it('ignores an unknown id', () => {
    expect(clearStore('nope')).toBe(false)
  })

  it('clears everything, session included, only on the explicit path', () => {
    for (const key of allLocalKeys()) localStorage.setItem(key, 'x')
    clearAllLocalData()
    for (const key of allLocalKeys()) expect(localStorage.getItem(key)).toBeNull()
  })

  it('leaves storage outside the inventory alone', () => {
    localStorage.setItem('someone-elses-key', 'keep me')
    clearAllLocalData()
    expect(localStorage.getItem('someone-elses-key')).toBe('keep me')
  })
})
