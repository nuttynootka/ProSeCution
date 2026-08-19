import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { replayOfflineQueue } from './backgroundReplay'
import { CircuitBreaker } from './circuitBreaker'
import { OfflineQueueRepository, type OfflineQueueItem } from './OfflineQueueRepository'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')
  openDbs.push(db)
  return { queue: new OfflineQueueRepository(db, vault) }
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

describe('replayOfflineQueue', () => {
  it('replays every pending item successfully and removes them from the queue', async () => {
    const { queue } = await harness()
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'one' } })
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'two' } })
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })

    const result = await replayOfflineQueue(queue, breaker, async () => {})

    expect(result.succeeded).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
    expect(await queue.listPending()).toEqual([])
  })

  it('keeps a failed item in the queue with attempts incremented, rather than dropping it', async () => {
    const { queue } = await harness()
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'will fail' } })
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })

    const result = await replayOfflineQueue(queue, breaker, async () => {
      throw new Error('provider down')
    })

    expect(result.failed).toHaveLength(1)
    const [pending] = await queue.listPending()
    expect(pending.attempts).toBe(1)
  })

  it('stops attempting once the circuit breaker opens, leaving the rest of the queue untouched', async () => {
    const { queue } = await harness()
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'one' } })
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'two' } })
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'three' } })
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 })

    const result = await replayOfflineQueue(queue, breaker, async () => {
      throw new Error('provider down')
    })

    // First item opens the circuit; the other two are never attempted at all.
    expect(result.failed).toHaveLength(1)
    expect(result.skippedCircuitOpen).toBe(2)
    expect(await queue.listPending()).toHaveLength(3) // the failed one stays too
  })

  it('replays a specific request body correctly through a real sender function', async () => {
    const { queue } = await harness()
    await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'How long do I have to respond?' } })
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    const received: OfflineQueueItem[] = []

    await replayOfflineQueue(queue, breaker, async (item) => {
      received.push(item)
    })

    expect(received).toHaveLength(1)
    expect(received[0].requestBody).toEqual({ query: 'How long do I have to respond?' })
    expect(received[0].endpoint).toBe('agent-a')
  })
})
