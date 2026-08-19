import type { CircuitBreaker } from './circuitBreaker'
import type { OfflineQueueItem, OfflineQueueRepository } from './OfflineQueueRepository'

export interface ReplayResult {
  succeeded: string[]
  failed: string[]
  /** Items never attempted because the circuit breaker was open — left in the queue for next time, not counted as failures. */
  skippedCircuitOpen: number
}

/**
 * Replays every queued offline request in FIFO order through `sender` (Chunk 38's
 * real LLM call, once it exists), respecting the circuit breaker — stops
 * attempting as soon as it opens rather than burning through the rest of the
 * queue against a provider that's already shown it's down. Succeeded items are
 * removed from the queue; failed ones stay, with `attempts` incremented, so a
 * caller can eventually give up on one that's failed too many times without this
 * function needing to know what "too many" means.
 */
export async function replayOfflineQueue(
  queue: OfflineQueueRepository,
  breaker: CircuitBreaker,
  sender: (item: OfflineQueueItem) => Promise<void>,
): Promise<ReplayResult> {
  const items = await queue.listPending()
  const result: ReplayResult = { succeeded: [], failed: [], skippedCircuitOpen: 0 }

  for (const item of items) {
    if (!breaker.canAttempt()) {
      result.skippedCircuitOpen += 1
      continue
    }
    try {
      await sender(item)
      breaker.recordSuccess()
      await queue.remove(item.id)
      result.succeeded.push(item.id)
    } catch {
      breaker.recordFailure()
      await queue.incrementAttempts(item.id)
      result.failed.push(item.id)
    }
  }

  return result
}
