import type { ServiceMethod } from './types'

export interface MailExtensionRule {
  days: number
  ruleCitation: string
}

/**
 * Deliberately tiny, same discipline as the deadline engine (Chunk 12): only two
 * jurisdictions, each backed by a real, checked citation, rather than a plausible
 * number for every state. Both were verified against the actual rule text, not
 * assumed from the blueprint's "+3 days" figure — which turned out to be exactly
 * right for federal court, but NOT for California, which grants 5 days, not 3.
 *
 * - Fed. R. Civ. P. 6(d): 3 days are added after the period would otherwise expire
 *   when service is made under Rule 5(b)(2)(C) (mail). The 2016 amendment removed
 *   electronic service from this list — email no longer gets the extra days — which
 *   is exactly why this rule is keyed by `ServiceMethod`, not applied unconditionally.
 * - Cal. Civ. Proc. Code § 1013(a): 5 calendar days when both the serving and served
 *   addresses are within California (10 days if the served address is elsewhere in
 *   the U.S. — not modeled here, same "don't guess past what's confidently checked"
 *   choice the deadline engine already makes for weekend/holiday adjustment).
 */
const MAIL_EXTENSION_RULES: Record<string, MailExtensionRule> = {
  federal: { days: 3, ruleCitation: 'Fed. R. Civ. P. 6(d)' },
  CA: { days: 5, ruleCitation: 'Cal. Civ. Proc. Code § 1013(a)' },
}

export const SEEDED_MAIL_EXTENSION_JURISDICTIONS: readonly string[] = Object.keys(MAIL_EXTENSION_RULES)

/**
 * Only mail service gets extra time. Personal delivery and (post-2016) electronic
 * service hand the document to the other side directly, with no transit delay to
 * compensate for — returning null for anything but 'mail' is the correct answer,
 * not a gap, which is why this doesn't route those through the "unseeded
 * jurisdiction" honesty check the way an unrecognized state does.
 */
export function computeMailServiceExtension(jurisdiction: string, method: ServiceMethod): MailExtensionRule | null {
  if (method !== 'mail') return null
  return MAIL_EXTENSION_RULES[jurisdiction] ?? null
}
