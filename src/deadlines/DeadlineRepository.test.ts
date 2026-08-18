import { afterEach, describe, expect, it } from 'vitest'
import { CaseNotFoundError } from '../cases/CaseRepository'
import { DeadlineNotFoundError } from './DeadlineRepository'
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

describe('createFromTrigger', () => {
  it('creates a real deadline for a seeded jurisdiction and trigger', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })

    const trigger = Date.UTC(2026, 2, 2) // Monday
    const [deadline] = await deadlines.createFromTrigger(c.id, 'service_of_summons', trigger)

    expect(deadline.dueDate).toBe(Date.UTC(2026, 2, 23))
    expect(deadline.ruleCitation).toBe('Fed. R. Civ. P. 12(a)(1)(A)(i)')
    expect(deadline.caseId).toBe(c.id)
    expect(deadline.status).toBe('pending')
    expect(deadline.trigger).toBe('service_of_summons')
    expect(deadline.triggerDate).toBe(trigger)
  })

  it('uses the case\'s own jurisdiction, not a caller-supplied one', async () => {
    const { cases, deadlines } = await harness()
    const caCase = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const [deadline] = await deadlines.createFromTrigger(caCase.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    expect(deadline.ruleCitation).toBe('Cal. Civ. Proc. Code § 412.20(a)(3)')
  })

  it('creates nothing for an unseeded jurisdiction, rather than guessing', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'TX', county: 'Harris', caseType: 'Civil' })

    const created = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    expect(created).toEqual([])
    expect(await deadlines.listForCase(c.id)).toEqual([])
  })

  it('creates nothing for a trigger this jurisdiction has no rule for', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })

    const created = await deadlines.createFromTrigger(c.id, 'filing_of_motion', Date.UTC(2026, 2, 2))

    expect(created).toEqual([])
  })

  it('throws CaseNotFoundError for an unknown case', async () => {
    const { deadlines } = await harness()
    await expect(
      deadlines.createFromTrigger('does-not-exist', 'service_of_summons', Date.UTC(2026, 2, 2)),
    ).rejects.toThrow(CaseNotFoundError)
  })

  it('stores the deadline encrypted — the raw record contains no plaintext title or citation', async () => {
    const { db, cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })

    await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    const [raw] = await db.deadlines.toArray()
    expect(JSON.stringify(raw.dataEnc)).not.toContain('Rule 12')
    expect(JSON.stringify(raw.dataEnc)).not.toContain('12(a)(1)')
  })
})

describe('listForCase', () => {
  it('returns deadlines soonest-due first, regardless of creation order', async () => {
    const { cases, deadlines } = await harness()
    const federalCase = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const caCase = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    // Same case can accumulate deadlines from different triggers over time — simulate
    // that by attaching both a CA-jurisdiction case's own deadline and, deliberately
    // out of chronological order, a second one on the same case from an earlier
    // trigger date.
    await deadlines.createFromTrigger(caCase.id, 'service_of_summons', Date.UTC(2026, 5, 1)) // due ~Jul 1
    await deadlines.createFromTrigger(caCase.id, 'service_of_summons', Date.UTC(2026, 0, 1)) // due ~Jan 31

    const list = await deadlines.listForCase(caCase.id)

    expect(list).toHaveLength(2)
    expect(list[0].dueDate).toBeLessThan(list[1].dueDate)
    // Sanity: the unrelated federal case's (nonexistent, since none created) deadlines don't leak in.
    expect(await deadlines.listForCase(federalCase.id)).toEqual([])
  })

  it('returns an empty array for a case with no deadlines', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    expect(await deadlines.listForCase(c.id)).toEqual([])
  })
})

describe('listAll', () => {
  it('returns deadlines from every case, soonest-due first', async () => {
    const { cases, deadlines } = await harness()
    const federalCase = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const caCase = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const [federalDeadline] = await deadlines.createFromTrigger(
      federalCase.id,
      'service_of_summons',
      Date.UTC(2026, 5, 1),
    )
    const [caDeadline] = await deadlines.createFromTrigger(caCase.id, 'service_of_summons', Date.UTC(2026, 0, 1))

    const all = await deadlines.listAll()

    expect(all.map((d) => d.id)).toEqual([caDeadline.id, federalDeadline.id])
    expect(caDeadline.dueDate).toBeLessThan(federalDeadline.dueDate)
  })

  it('returns an empty array when there are no deadlines anywhere', async () => {
    const { deadlines } = await harness()
    expect(await deadlines.listAll()).toEqual([])
  })
})

describe('setStatus', () => {
  it('marks a deadline completed and persists it', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const [created] = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    const updated = await deadlines.setStatus(created.id, 'completed')
    expect(updated.status).toBe('completed')

    const refetched = await deadlines.get(created.id)
    expect(refetched?.status).toBe('completed')
  })

  it('can move a deadline back to pending', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const [created] = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    await deadlines.setStatus(created.id, 'completed')
    const reverted = await deadlines.setStatus(created.id, 'pending')

    expect(reverted.status).toBe('pending')
  })

  it('throws DeadlineNotFoundError for an unknown id', async () => {
    const { deadlines } = await harness()
    await expect(deadlines.setStatus('does-not-exist', 'completed')).rejects.toThrow(DeadlineNotFoundError)
  })
})

describe('delete', () => {
  it('removes the deadline', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const [created] = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    await deadlines.delete(created.id)

    expect(await deadlines.get(created.id)).toBeUndefined()
  })
})

describe('cascade from CaseRepository.delete', () => {
  it('deleting a case deletes every deadline attached to it', async () => {
    const { cases, deadlines } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    await cases.delete(c.id)

    expect(await deadlines.listForCase(c.id)).toEqual([])
  })

  it('does not affect deadlines belonging to a different case', async () => {
    const { cases, deadlines } = await harness()
    const caseA = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const caseB = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })
    const [deadlineB] = await deadlines.createFromTrigger(caseB.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    await cases.delete(caseA.id)

    expect(await deadlines.get(deadlineB.id)).toEqual(deadlineB)
  })
})
