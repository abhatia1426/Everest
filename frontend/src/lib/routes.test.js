import { describe, expect, it, vi } from 'vitest'

/**
 * The preload cache is a module-level closure, so these tests exercise it
 * through a local rebuild of `preloadable` rather than the exported routes —
 * importing those would pull in the real page chunks and their chart deps.
 *
 * What matters is the caching contract: successes are shared, failures are not.
 */
function preloadable(importer) {
  let promise = null
  const load = () => {
    promise =
      promise ||
      importer().catch((error) => {
        promise = null
        throw error
      })
    return promise
  }
  return { load }
}

describe('chunk preloading', () => {
  it('starts only one download no matter how often a link is hovered', async () => {
    const importer = vi.fn(() => Promise.resolve({ default: () => null }))
    const { load } = preloadable(importer)

    await Promise.all([load(), load(), load()])

    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure — a later attempt re-requests the chunk', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('network dropped'))
      .mockResolvedValue({ default: () => null })
    const { load } = preloadable(importer)

    await expect(load()).rejects.toThrow('network dropped')

    // Without clearing the memoised rejection this second call would replay
    // the original error forever and the route would be permanently dead.
    await expect(load()).resolves.toEqual({ default: expect.any(Function) })
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
