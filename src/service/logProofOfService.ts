import type { CaseRepository } from '../cases/CaseRepository'
import type { DeadlineRepository } from '../deadlines/DeadlineRepository'
import { isFederalHolidayOrWeekend } from '../deadlines/holidays'
import type { Deadline, DeadlineContent } from '../deadlines/types'
import { computeMailServiceExtension } from './engine'
import type { ProofOfServiceRepository } from './ProofOfServiceRepository'
import type { ProofOfService, ProofOfServiceInput } from './types'

const MS_PER_DAY = 86_400_000

function addDaysAndAdjust(dueDate: number, days: number): { dueDate: number; isWeekendAdjusted: boolean } {
  const raw = dueDate + days * MS_PER_DAY
  let adjusted = raw
  // Same convention as the deadline engine (Chunk 12): a date that lands on a
  // weekend or federal holiday rolls forward to the next real court day.
  while (isFederalHolidayOrWeekend(adjusted)) {
    adjusted += MS_PER_DAY
  }
  return { dueDate: adjusted, isWeekendAdjusted: adjusted !== raw }
}

export interface LogProofOfServiceDeps {
  caseRepository: CaseRepository
  deadlineRepository: DeadlineRepository
  proofOfServiceRepository: ProofOfServiceRepository
}

export interface LogProofOfServiceResult {
  proofOfService: ProofOfService
  extendedDeadline: Deadline | null
}

/**
 * Orchestrates across three repositories rather than living inside any one of them —
 * the first cross-repository coordination in this app (every repository elsewhere
 * only ever touches its own table). Kept as a standalone function instead of adding
 * a dependency from one repository's constructor to another, so every repository
 * keeps the same plain "db + vault" shape the rest of the app relies on.
 *
 * When `input.linkedDeadlineId` names an existing deadline and the case's own
 * jurisdiction plus the chosen service method has a real mail-extension rule (this
 * chunk's engine), this creates a second, explicitly linked deadline — the same
 * obligation, due `days` calendar days later — rather than mutating the original.
 * The original deadline is left exactly as calculated; nothing here silently moves a
 * date the user may already be relying on elsewhere (an .ics export, a reminder).
 */
export async function logProofOfService(
  caseId: string,
  input: ProofOfServiceInput,
  deps: LogProofOfServiceDeps,
): Promise<LogProofOfServiceResult> {
  let extendedDeadline: Deadline | null = null

  if (input.linkedDeadlineId) {
    const original = await deps.deadlineRepository.get(input.linkedDeadlineId)
    const caseRecord = original ? await deps.caseRepository.get(caseId) : undefined
    const extension = caseRecord ? computeMailServiceExtension(caseRecord.state, input.serviceMethod) : null

    if (original && extension) {
      const { dueDate, isWeekendAdjusted } = addDaysAndAdjust(original.dueDate, extension.days)
      const content: DeadlineContent = {
        title: `${original.title} (extended for mail service)`,
        description: `A ${extension.days}-calendar-day mail-service extension of "${original.title}," under ${extension.ruleCitation}.`,
        dueDate,
        ruleCitation: extension.ruleCitation,
        isWeekendAdjusted,
        trigger: 'mail_service_extension',
        triggerDate: input.serviceDate,
        status: 'pending',
        isServiceDeadline: true,
        relatedDeadlineId: original.id,
      }
      extendedDeadline = await deps.deadlineRepository.createDirect(caseId, content)
    }
  }

  const proofOfService = await deps.proofOfServiceRepository.create(caseId, {
    ...input,
    extensionDeadlineId: extendedDeadline?.id,
  })

  return { proofOfService, extendedDeadline }
}
