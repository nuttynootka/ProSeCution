/**
 * `Date.now()` has millisecond resolution, but repositories can create several
 * records (e.g. a case plus its parties) within the same millisecond — especially
 * in tests, but plausibly in production too (bulk party entry, imports). When that
 * happens, an index ordered by plain `Date.now()` has ties, and IndexedDB doesn't
 * break ties by insertion order, so "most recent first" becomes nondeterministic.
 *
 * This guarantees each call returns a value strictly greater than the last one
 * returned by *this module* (shared across the whole app, not per-caller), so
 * `createdAt`/`updatedAt` stay usable as a total order. It stays true wall-clock
 * time except during a same-millisecond burst, where later calls are nudged forward
 * by 1ms each — a deviation of microseconds in practice, never something a person
 * would notice on a displayed date.
 */
let lastTimestamp = 0

export function monotonicNow(): number {
  const now = Date.now()
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1
  return lastTimestamp
}
