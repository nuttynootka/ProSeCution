/**
 * A small, real Mustache-like renderer — not a stub. The blueprint's own prompt
 * templates (section 7) use both plain `{{var}}` substitution and a
 * `{{#each array}}...{{/each}}` loop block (Agent A's retrieved_chunks), so a
 * simple string-replace-only renderer would silently fail to reproduce the actual
 * prompts. Deliberately minimal beyond that — no conditionals, no nesting — because
 * nothing in this app's five prompts needs more than substitution and one flat loop.
 */
export type PromptVars = Record<string, unknown>

export function renderPromptTemplate(template: string, vars: PromptVars): string {
  const withLoopsExpanded = template.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, key: string, block: string) => {
    const items = vars[key]
    if (!Array.isArray(items)) return ''
    return items
      .map((item) => substituteVars(block, item as PromptVars).trim())
      .join('\n')
  })
  return substituteVars(withLoopsExpanded, vars)
}

function substituteVars(text: string, vars: PromptVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    return value === undefined ? '' : String(value)
  })
}
