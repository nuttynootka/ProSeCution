import { afterEach, describe, expect, it } from 'vitest'
import { PartyNotFoundError } from './PartyRepository'
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
  it('returns the party with an id, caseId and timestamps', async () => {
    const { cases, parties } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    const party = await parties.create(c.id, { name: 'Maria Hartley', role: 'plaintiff' })

    expect(party.id).toBeTruthy()
    expect(party.caseId).toBe(c.id)
    expect(party.createdAt).toBe(party.updatedAt)
    expect(party).toMatchObject({ name: 'Maria Hartley', role: 'plaintiff' })
  })

  it('stores content encrypted — the raw Dexie record contains no plaintext name', async () => {
    const { db, cases, parties } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    await parties.create(c.id, { name: 'Maria Hartley', role: 'plaintiff' })

    const rawRecords = await db.parties.toArray()
    const raw = JSON.stringify(rawRecords[0])
    expect(raw).not.toContain('Maria')
    expect(raw).not.toContain('Hartley')
    // caseId is a deliberate exception — it's a plain foreign key, not case content.
    expect(rawRecords[0].caseId).toBe(c.id)
  })
})

describe('listForCase', () => {
  it('returns only parties belonging to the given case, in creation order', async () => {
    const { cases, parties } = await harness()
    const caseA = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const caseB = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    const plaintiff = await parties.create(caseA.id, { name: 'Maria Hartley', role: 'plaintiff' })
    const defendant = await parties.create(caseA.id, { name: 'R. Cordova', role: 'defendant' })
    await parties.create(caseB.id, { name: 'Unrelated Party', role: 'plaintiff' })

    const forCaseA = await parties.listForCase(caseA.id)

    expect(forCaseA.map((p) => p.id)).toEqual([plaintiff.id, defendant.id])
  })

  it('returns an empty array for a case with no parties', async () => {
    const { cases, parties } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    expect(await parties.listForCase(c.id)).toEqual([])
  })
})

describe('update', () => {
  it('applies a partial patch', async () => {
    const { cases, parties } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const party = await parties.create(c.id, { name: 'Maria Hartley', role: 'plaintiff' })

    const updated = await parties.update(party.id, { name: 'Maria Hartley-Nguyen' })

    expect(updated.name).toBe('Maria Hartley-Nguyen')
    expect(updated.role).toBe('plaintiff')
  })

  it('throws PartyNotFoundError for an unknown id', async () => {
    const { parties } = await harness()
    await expect(parties.update('does-not-exist', { name: 'X' })).rejects.toThrow(
      PartyNotFoundError,
    )
  })
})

describe('delete', () => {
  it('removes the party without affecting others on the same case', async () => {
    const { cases, parties } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const plaintiff = await parties.create(c.id, { name: 'Maria Hartley', role: 'plaintiff' })
    const defendant = await parties.create(c.id, { name: 'R. Cordova', role: 'defendant' })

    await parties.delete(plaintiff.id)

    expect(await parties.get(plaintiff.id)).toBeUndefined()
    expect(await parties.get(defendant.id)).toEqual(defendant)
  })
})
