import { afterEach, describe, expect, it } from 'vitest'
import { freshUnlockedStore } from './testHarness'
import type { ProofOfServiceContent } from './types'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const store = await freshUnlockedStore()
  openDbs.push(store.db)
  return store
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

const CONTENT: ProofOfServiceContent = {
  partyId: 'party-1',
  partyName: 'R. Cordova',
  documentDescription: 'Motion to Compel Discovery',
  serviceMethod: 'mail',
  serviceDate: Date.UTC(2026, 2, 3),
  serviceAddress: '123 Main St, Los Angeles, CA 90001',
}

describe('create / get', () => {
  it('creates and returns a real record with an id and timestamps', async () => {
    const { cases, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const created = await proofOfService.create(c.id, CONTENT)

    expect(created.id).toBeTruthy()
    expect(created.caseId).toBe(c.id)
    expect(created.partyName).toBe('R. Cordova')
    expect(created.serviceMethod).toBe('mail')
    expect(await proofOfService.get(created.id)).toEqual(created)
  })

  it('stores content encrypted — the raw Dexie record has no plaintext party name', async () => {
    const { db, cases, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const created = await proofOfService.create(c.id, CONTENT)

    const raw = await db.proofOfService.get(created.id)
    expect(raw!.dataEnc).not.toContain('Cordova')
    expect(raw!.dataEnc).not.toContain('Main St')
  })

  it('returns undefined for an unknown id', async () => {
    const { proofOfService } = await harness()
    expect(await proofOfService.get('nope')).toBeUndefined()
  })
})

describe('listForCase', () => {
  it('returns only this case\'s records, most recently logged first', async () => {
    const { cases, proofOfService } = await harness()
    const a = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const b = await cases.create({ state: 'CA', county: 'Orange', caseType: 'Civil' })

    const first = await proofOfService.create(a.id, CONTENT)
    const second = await proofOfService.create(a.id, { ...CONTENT, documentDescription: 'Opposition to Motion' })
    await proofOfService.create(b.id, CONTENT)

    const forA = await proofOfService.listForCase(a.id)
    expect(forA.map((p) => p.id)).toEqual([second.id, first.id])
  })
})

describe('delete', () => {
  it('removes the record', async () => {
    const { cases, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const created = await proofOfService.create(c.id, CONTENT)

    await proofOfService.delete(created.id)

    expect(await proofOfService.get(created.id)).toBeUndefined()
  })
})
