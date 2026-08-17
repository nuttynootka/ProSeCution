import { afterEach, describe, expect, it } from 'vitest'
import { VaultLockedError } from '../vault/VaultService'
import { CaseNotFoundError } from './CaseRepository'
import { freshUnlockedStore } from './testHarness'

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

describe('create', () => {
  it('returns the case with an id and timestamps', async () => {
    const { cases } = await harness()

    const created = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBe(created.updatedAt)
    expect(created).toMatchObject({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
  })

  it('assigns each case a distinct id', async () => {
    const { cases } = await harness()

    const a = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const b = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    expect(a.id).not.toBe(b.id)
  })

  it('stores content encrypted — the raw Dexie record contains no plaintext', async () => {
    const { db, cases } = await harness()

    await cases.create({ state: 'WA', county: 'King', caseType: 'Family Law — Custody' })

    const rawRecords = await db.cases.toArray()
    expect(rawRecords).toHaveLength(1)
    const raw = JSON.stringify(rawRecords[0])
    expect(raw).not.toContain('King')
    expect(raw).not.toContain('Family Law')
    expect(raw).not.toContain('Custody')
  })
})

describe('get', () => {
  it('returns the case by id', async () => {
    const { cases } = await harness()
    const created = await cases.create({ state: 'CA', county: 'Orange', caseType: 'Small Claims' })

    const fetched = await cases.get(created.id)

    expect(fetched).toEqual(created)
  })

  it('returns undefined for an unknown id', async () => {
    const { cases } = await harness()
    expect(await cases.get('does-not-exist')).toBeUndefined()
  })
})

describe('list', () => {
  it('returns every case, most recently created first', async () => {
    const { cases } = await harness()
    const first = await cases.create({ state: 'CA', county: 'A', caseType: 'X' })
    const second = await cases.create({ state: 'CA', county: 'B', caseType: 'X' })
    const third = await cases.create({ state: 'CA', county: 'C', caseType: 'X' })

    const list = await cases.list()

    expect(list.map((c) => c.id)).toEqual([third.id, second.id, first.id])
  })

  it('returns an empty array when there are no cases', async () => {
    const { cases } = await harness()
    expect(await cases.list()).toEqual([])
  })
})

describe('update', () => {
  it('applies a partial patch and leaves other fields untouched', async () => {
    const { cases } = await harness()
    const created = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const updated = await cases.update(created.id, { caseType: 'Civil — Breach of Contract' })

    expect(updated.caseType).toBe('Civil — Breach of Contract')
    expect(updated.state).toBe('CA')
    expect(updated.county).toBe('Los Angeles')
  })

  it('advances updatedAt but preserves createdAt', async () => {
    const { cases } = await harness()
    const created = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    const updated = await cases.update(created.id, { county: 'San Diego' })

    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.createdAt)
  })

  it('persists the update — a fresh get() sees it', async () => {
    const { cases } = await harness()
    const created = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    await cases.update(created.id, { county: 'San Diego' })
    const refetched = await cases.get(created.id)

    expect(refetched?.county).toBe('San Diego')
  })

  it('throws CaseNotFoundError for an unknown id', async () => {
    const { cases } = await harness()
    await expect(cases.update('does-not-exist', { county: 'X' })).rejects.toThrow(CaseNotFoundError)
  })
})

describe('delete', () => {
  it('removes the case', async () => {
    const { cases } = await harness()
    const created = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    await cases.delete(created.id)

    expect(await cases.get(created.id)).toBeUndefined()
  })

  it('cascades to every party attached to the case', async () => {
    const { cases, parties } = await harness()
    const created = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    await parties.create(created.id, { name: 'Maria Hartley', role: 'plaintiff' })
    await parties.create(created.id, { name: 'R. Cordova', role: 'defendant' })

    await cases.delete(created.id)

    expect(await parties.listForCase(created.id)).toEqual([])
  })

  it('does not affect parties belonging to a different case', async () => {
    const { cases, parties } = await harness()
    const caseA = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const caseB = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    await parties.create(caseA.id, { name: 'Party A', role: 'plaintiff' })
    const partyB = await parties.create(caseB.id, { name: 'Party B', role: 'plaintiff' })

    await cases.delete(caseA.id)

    expect(await parties.get(partyB.id)).toEqual(partyB)
  })

  it('does not throw when deleting an id that does not exist', async () => {
    const { cases } = await harness()
    await expect(cases.delete('does-not-exist')).resolves.not.toThrow()
  })
})

describe('when the vault is locked', () => {
  it('create rejects with VaultLockedError', async () => {
    const { cases, vault } = await harness()
    vault.lock()
    await expect(cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })).rejects.toThrow(
      VaultLockedError,
    )
  })

  it('get rejects with VaultLockedError (decrypting a locked record, not returning ciphertext)', async () => {
    const { cases, vault } = await harness()
    const created = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    vault.lock()

    await expect(cases.get(created.id)).rejects.toThrow(VaultLockedError)
  })
})
