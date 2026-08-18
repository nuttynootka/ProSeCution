import { afterEach, describe, expect, it } from 'vitest'
import type { DeadlineContent } from '../deadlines/types'
import { logProofOfService } from './logProofOfService'
import { freshUnlockedStore } from './testHarness'
import type { ProofOfServiceInput } from './types'

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

const BASE_INPUT: ProofOfServiceInput = {
  partyId: 'party-1',
  partyName: 'R. Cordova',
  documentDescription: 'Motion to Compel Discovery',
  serviceMethod: 'mail',
  serviceDate: Date.UTC(2026, 2, 3),
}

describe('logProofOfService', () => {
  it('creates a linked, extended deadline for mail service in a seeded jurisdiction (CA: +5 days, Cal. Civ. Proc. Code § 1013(a))', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const [original] = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2)) // Monday -> due Wed Apr 1, 2026

    const { proofOfService: pos, extendedDeadline } = await logProofOfService(
      c.id,
      { ...BASE_INPUT, linkedDeadlineId: original.id },
      { caseRepository: cases, deadlineRepository: deadlines, proofOfServiceRepository: proofOfService },
    )

    expect(extendedDeadline).not.toBeNull()
    expect(extendedDeadline!.dueDate).toBe(Date.UTC(2026, 3, 6)) // Apr 1 + 5 days = Mon Apr 6, no weekend adjustment needed
    expect(extendedDeadline!.ruleCitation).toBe('Cal. Civ. Proc. Code § 1013(a)')
    expect(extendedDeadline!.isServiceDeadline).toBe(true)
    expect(extendedDeadline!.relatedDeadlineId).toBe(original.id)
    expect(extendedDeadline!.trigger).toBe('mail_service_extension')

    expect(pos.extensionDeadlineId).toBe(extendedDeadline!.id)
    expect(pos.linkedDeadlineId).toBe(original.id)

    // The original deadline is untouched — nothing here silently moved a date the
    // user might already be relying on elsewhere.
    expect((await deadlines.get(original.id))!.dueDate).toBe(original.dueDate)

    const forCase = await deadlines.listForCase(c.id)
    expect(forCase).toHaveLength(2)
  })

  it('rolls the extended due date forward off a weekend, same as the deadline engine', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'federal', county: 'N.D. Cal.', caseType: 'Civil' })

    // Directly seeded: Wed Mar 4, 2026. Federal mail extension is +3 days, landing
    // raw on Sat Mar 7 — which must roll to Mon Mar 9.
    const content: DeadlineContent = {
      title: 'Opposition to Motion to Compel',
      description: 'test fixture',
      dueDate: Date.UTC(2026, 2, 4),
      ruleCitation: 'test',
      isWeekendAdjusted: false,
      trigger: 'filing_of_motion',
      triggerDate: Date.UTC(2026, 2, 4),
      status: 'pending',
    }
    const original = await deadlines.createDirect(c.id, content)

    const { extendedDeadline } = await logProofOfService(
      c.id,
      { ...BASE_INPUT, linkedDeadlineId: original.id },
      { caseRepository: cases, deadlineRepository: deadlines, proofOfServiceRepository: proofOfService },
    )

    expect(extendedDeadline!.dueDate).toBe(Date.UTC(2026, 2, 9)) // Monday
    expect(extendedDeadline!.isWeekendAdjusted).toBe(true)
  })

  it('creates no extended deadline for personal service, even in a seeded jurisdiction', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const [original] = await deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))

    const { extendedDeadline, proofOfService: pos } = await logProofOfService(
      c.id,
      { ...BASE_INPUT, serviceMethod: 'personal', linkedDeadlineId: original.id },
      { caseRepository: cases, deadlineRepository: deadlines, proofOfServiceRepository: proofOfService },
    )

    expect(extendedDeadline).toBeNull()
    expect(pos.extensionDeadlineId).toBeUndefined()
    expect(await deadlines.listForCase(c.id)).toHaveLength(1) // just the original
  })

  it('creates no extended deadline for an unseeded jurisdiction, rather than guessing a number of days', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'TX', county: 'Harris', caseType: 'Civil' })
    const content: DeadlineContent = {
      title: 'Some deadline',
      description: 'test fixture',
      dueDate: Date.UTC(2026, 2, 4),
      ruleCitation: 'test',
      isWeekendAdjusted: false,
      trigger: 'filing_of_motion',
      triggerDate: Date.UTC(2026, 2, 4),
      status: 'pending',
    }
    const original = await deadlines.createDirect(c.id, content)

    const { extendedDeadline } = await logProofOfService(
      c.id,
      { ...BASE_INPUT, linkedDeadlineId: original.id },
      { caseRepository: cases, deadlineRepository: deadlines, proofOfServiceRepository: proofOfService },
    )

    expect(extendedDeadline).toBeNull()
  })

  it('logs a proof of service with no linked deadline at all', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const { proofOfService: pos, extendedDeadline } = await logProofOfService(c.id, BASE_INPUT, {
      caseRepository: cases,
      deadlineRepository: deadlines,
      proofOfServiceRepository: proofOfService,
    })

    expect(extendedDeadline).toBeNull()
    expect(pos.linkedDeadlineId).toBeUndefined()
    expect(pos.partyName).toBe('R. Cordova')
    expect(await proofOfService.listForCase(c.id)).toHaveLength(1)
  })

  it('is honest about a linkedDeadlineId that does not actually exist, rather than throwing', async () => {
    const { cases, deadlines, proofOfService } = await harness()
    const c = await cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const { extendedDeadline, proofOfService: pos } = await logProofOfService(
      c.id,
      { ...BASE_INPUT, linkedDeadlineId: 'not-a-real-id' },
      { caseRepository: cases, deadlineRepository: deadlines, proofOfServiceRepository: proofOfService },
    )

    expect(extendedDeadline).toBeNull()
    expect(pos.linkedDeadlineId).toBe('not-a-real-id')
  })
})
