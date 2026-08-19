import { describe, expect, it } from 'vitest'
import { renderPromptTemplate } from './render'
import {
  AGENT_A_GROUNDED_QA,
  AGENT_D_MOTION_DRAFTER,
  getPromptTemplate,
  PROMPT_TEMPLATES,
  styleGuideFor,
} from './registry'

describe('PROMPT_TEMPLATES', () => {
  it('has exactly the five agent prompts, each with an id and a version', () => {
    expect(PROMPT_TEMPLATES).toHaveLength(5)
    for (const t of PROMPT_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.version).toBeGreaterThanOrEqual(1)
    }
  })

  it('looks up a template by id', () => {
    expect(getPromptTemplate('agent-a-grounded-qa')).toBe(AGENT_A_GROUNDED_QA)
    expect(getPromptTemplate('nope')).toBeUndefined()
  })

  it("preserves Agent A's literal out-of-bounds sentinel verbatim, not paraphrased", () => {
    expect(AGENT_A_GROUNDED_QA.template).toContain('ERR_OUT_OF_BOUNDS_LEGAL_CORPUS')
  })

  it('renders Agent A with real retrieved chunks and a real question', () => {
    const rendered = renderPromptTemplate(AGENT_A_GROUNDED_QA.template, {
      retrieved_chunks: [{ source_ref: 'Cal. Civ. Proc. Code § 412.20', chunk_text: 'Must respond within 30 days.' }],
      user_query: 'How long do I have to respond?',
    })
    expect(rendered).toContain('[Source: Cal. Civ. Proc. Code § 412.20] Must respond within 30 days.')
    expect(rendered).toContain('USER QUESTION: How long do I have to respond?')
  })

  it('renders Agent D with real case context', () => {
    const rendered = renderPromptTemplate(AGENT_D_MOTION_DRAFTER.template, {
      court_name: 'Superior Court of California, County of Los Angeles',
      case_number: '24CV1234',
      plaintiff_name: 'Maria Hartley',
      defendant_name: 'R. Cordova',
      facts_summary: 'Defendant breached the lease agreement.',
      motion_type: 'Motion to Compel',
    })
    expect(rendered).toContain('Case Number: 24CV1234')
    expect(rendered).toContain('Plaintiff Maria Hartley vs. Defendant R. Cordova')
  })
})

describe('styleGuideFor', () => {
  it('returns the real seeded CA style guide', () => {
    const guide = styleGuideFor('CA')
    expect(guide?.label).toContain('Los Angeles')
    expect(guide?.text).toContain('Times New Roman')
  })

  it('returns undefined for an unseeded jurisdiction, rather than guessing formatting rules', () => {
    expect(styleGuideFor('TX')).toBeUndefined()
  })
})
