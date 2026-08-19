import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { ExhibitListRepository } from './ExhibitListRepository'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')
  openDbs.push(db)
  return { db, vault, exhibits: new ExhibitListRepository(db, vault) }
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

describe('ExhibitListRepository', () => {
  it('returns an honest empty list before anything is saved for a case', async () => {
    const { exhibits } = await harness()
    expect(await exhibits.getForCase('case-1')).toEqual({ items: [] })
  })

  it('saves and reloads a real ordered list of items', async () => {
    const { exhibits } = await harness()
    const items = [
      { documentId: 'doc-1', description: 'Lease agreement' },
      { documentId: 'doc-2', description: 'Text message thread' },
    ]
    await exhibits.saveForCase('case-1', { items })

    expect(await exhibits.getForCase('case-1')).toEqual({ items })
  })

  it('keeps two different cases\' exhibit lists independent', async () => {
    const { exhibits } = await harness()
    await exhibits.saveForCase('case-1', { items: [{ documentId: 'doc-1', description: 'A' }] })
    await exhibits.saveForCase('case-2', { items: [{ documentId: 'doc-2', description: 'B' }] })

    expect(await exhibits.getForCase('case-1')).toEqual({ items: [{ documentId: 'doc-1', description: 'A' }] })
    expect(await exhibits.getForCase('case-2')).toEqual({ items: [{ documentId: 'doc-2', description: 'B' }] })
  })

  it('stores the list encrypted — the raw Dexie record has no plaintext description', async () => {
    const { db, exhibits } = await harness()
    await exhibits.saveForCase('case-1', { items: [{ documentId: 'doc-1', description: 'Very sensitive description' }] })

    const raw = await db.exhibitLists.get('case-1')
    expect(raw!.dataEnc).not.toContain('Very sensitive description')
  })

  it('overwrites the previous list on a second save, rather than appending', async () => {
    const { exhibits } = await harness()
    await exhibits.saveForCase('case-1', { items: [{ documentId: 'doc-1', description: 'First' }] })
    await exhibits.saveForCase('case-1', { items: [{ documentId: 'doc-2', description: 'Second' }] })

    expect(await exhibits.getForCase('case-1')).toEqual({ items: [{ documentId: 'doc-2', description: 'Second' }] })
  })

  it('keeps the original createdAt across an update, while advancing updatedAt', async () => {
    const { db, exhibits } = await harness()
    await exhibits.saveForCase('case-1', { items: [] })
    const first = await db.exhibitLists.get('case-1')

    await exhibits.saveForCase('case-1', { items: [{ documentId: 'doc-1', description: 'x' }] })
    const second = await db.exhibitLists.get('case-1')

    expect(second!.createdAt).toBe(first!.createdAt)
    expect(second!.updatedAt).toBeGreaterThanOrEqual(first!.updatedAt)
  })
})
