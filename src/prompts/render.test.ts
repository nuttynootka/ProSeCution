import { describe, expect, it } from 'vitest'
import { renderPromptTemplate } from './render'

describe('renderPromptTemplate', () => {
  it('substitutes plain variables', () => {
    expect(renderPromptTemplate('Hello {{name}}, case {{caseNumber}}.', { name: 'Maria', caseNumber: '24CV1234' })).toBe(
      'Hello Maria, case 24CV1234.',
    )
  })

  it('leaves a missing variable blank rather than throwing or leaving the placeholder literal', () => {
    expect(renderPromptTemplate('Value: {{missing}}.', {})).toBe('Value: .')
  })

  it('expands an #each block once per array item, substituting fields from that item', () => {
    const template = 'EXCERPTS:\n{{#each retrieved_chunks}}\n[Source: {{source_ref}}] {{chunk_text}}\n{{/each}}'
    const rendered = renderPromptTemplate(template, {
      retrieved_chunks: [
        { source_ref: 'Cal. Civ. Proc. Code § 412.20', chunk_text: 'A defendant must respond within 30 days.' },
        { source_ref: 'Fed. R. Civ. P. 12(a)(1)(A)(i)', chunk_text: 'A defendant must serve an answer within 21 days.' },
      ],
    })
    expect(rendered).toContain('[Source: Cal. Civ. Proc. Code § 412.20] A defendant must respond within 30 days.')
    expect(rendered).toContain('[Source: Fed. R. Civ. P. 12(a)(1)(A)(i)] A defendant must serve an answer within 21 days.')
  })

  it('expands to nothing for an empty array, without leaving the block markers behind', () => {
    const rendered = renderPromptTemplate('{{#each items}}{{x}}{{/each}}', { items: [] })
    expect(rendered).toBe('')
  })
})
