import { afterEach, describe, expect, it, vi } from 'vitest'

// `monotonicNow`'s guarantee is about a single shared counter, so each test gets its
// own fresh module instance (rather than relying on shared state staying within
// bounds across tests) — resetModules + a dynamic re-import is the correct way to do
// that, not just asserting relative order and hoping mock values never overlap.
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('monotonicNow', () => {
  it('returns strictly increasing values even when Date.now() does not advance', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const { monotonicNow } = await import('./monotonicClock')

    const values = Array.from({ length: 5 }, () => monotonicNow())

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('tracks real time forward once the clock advances past the nudged value', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    const { monotonicNow } = await import('./monotonicClock')
    const stalled = monotonicNow()

    vi.spyOn(Date, 'now').mockReturnValue(2_000_010)
    const advanced = monotonicNow()

    expect(advanced).toBe(2_000_010)
    expect(advanced).toBeGreaterThan(stalled)
  })

  it('starts from real time in a fresh module instance', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000_000)
    const { monotonicNow } = await import('./monotonicClock')

    expect(monotonicNow()).toBe(5_000_000)
  })
})
