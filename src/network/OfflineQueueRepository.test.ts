import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { OfflineQueueRepository } from './OfflineQueueRepository'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')
  openDbs.push(db)
  return { db, vault, queue: new OfflineQueueRepository(db, vault) }
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

describe('OfflineQueueRepository', () => {
  it('enqueues and lists a real item, oldest first', async () => {
    const { queue } = await harness()
    const first = await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'first' } })
    const second = await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'second' } })

    const pending = await queue.listPending()
    expect(pending.map((i) => i.id)).toEqual([first.id, second.id])
    expect(pending[0].requestBody).toEqual({ query: 'first' })
    expect(pending[0].attempts).toBe(0)
  })

  it('stores content encrypted — the raw Dexie record has no plaintext request body', async () => {
    const { db, queue } = await harness()
    const item = await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'a secret legal question' } })
    const raw = await db.offlineQueue.get(item.id)
    expect(raw!.dataEnc).not.toContain('secret legal question')
  })

  it('increments attempts without touching the encrypted content', async () => {
    const { queue } = await harness()
    const item = await queue.enqueue({ endpoint: 'agent-a', requestBody: { query: 'x' } })
    await queue.incrementAttempts(item.id)
    await queue.incrementAttempts(item.id)
    const [pending] = await queue.listPending()
    expect(pending.attempts).toBe(2)
    expect(pending.requestBody).toEqual({ query: 'x' })
  })

  it('removes an item for real', async () => {
    const { queue } = await harness()
    const item = await queue.enqueue({ endpoint: 'agent-a', requestBody: {} })
    await queue.remove(item.id)
    expect(await queue.listPending()).toEqual([])
  })
})
