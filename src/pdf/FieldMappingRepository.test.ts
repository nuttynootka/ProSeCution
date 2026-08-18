import { afterEach, describe, expect, it } from 'vitest'
import { freshUnlockedStore } from './testHarness'
import type { TemplateField } from './types'

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

const nameField: TemplateField = {
  fieldId: 'plaintiff-name',
  type: 'SINGLE_LINE',
  boundingBox: { left: 72, top: 700, width: 200, height: 14 },
  label: 'Plaintiff name',
  suggestedGlobalKey: 'plaintiff.name',
}

const factsField: TemplateField = {
  fieldId: 'facts',
  type: 'MULTI_LINE_RULED',
  boundingBox: { left: 72, top: 500, width: 468, height: 120 },
  baselineYOffset: 4,
  lineHeight: 18,
  maxLines: 6,
}

describe('upsertForPage', () => {
  it('creates a mapping with the given fields', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()

    const mapping = await fieldMappings.upsertForPage(template, 1, [nameField, factsField])

    expect(mapping.templateId).toBe(template)
    expect(mapping.pageNum).toBe(1)
    expect(mapping.fields).toEqual([nameField, factsField])
  })

  it('replaces the existing mapping for the same page rather than creating a second one', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()

    const first = await fieldMappings.upsertForPage(template, 1, [nameField])
    const second = await fieldMappings.upsertForPage(template, 1, [factsField])

    expect(second.id).toBe(first.id)
    expect(second.fields).toEqual([factsField])
    expect(await fieldMappings.listForTemplate(template)).toHaveLength(1)
  })

  it('keeps separate pages of the same template as separate mappings', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()

    await fieldMappings.upsertForPage(template, 1, [nameField])
    await fieldMappings.upsertForPage(template, 2, [factsField])

    const all = await fieldMappings.listForTemplate(template)
    expect(all).toHaveLength(2)
  })

  it('stores field data encrypted — the raw record contains no plaintext label', async () => {
    const { db, fieldMappings } = await harness()
    const template = crypto.randomUUID()

    await fieldMappings.upsertForPage(template, 1, [nameField])

    const [raw] = await db.fieldMappings.toArray()
    expect(JSON.stringify(raw.dataEnc)).not.toContain('Plaintiff name')
  })
})

describe('getForPage', () => {
  it('finds the mapping for a specific page', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()
    await fieldMappings.upsertForPage(template, 1, [nameField])
    await fieldMappings.upsertForPage(template, 2, [factsField])

    const page2 = await fieldMappings.getForPage(template, 2)

    expect(page2?.fields).toEqual([factsField])
  })

  it('returns undefined when no mapping exists for that page', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()
    expect(await fieldMappings.getForPage(template, 1)).toBeUndefined()
  })
})

describe('listForTemplate', () => {
  it('returns mappings in page order regardless of creation order', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()
    await fieldMappings.upsertForPage(template, 2, [factsField])
    await fieldMappings.upsertForPage(template, 1, [nameField])

    const all = await fieldMappings.listForTemplate(template)

    expect(all.map((m) => m.pageNum)).toEqual([1, 2])
  })

  it('returns an empty array for a template with no mappings', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()
    expect(await fieldMappings.listForTemplate(template)).toEqual([])
  })
})

describe('delete', () => {
  it('removes the mapping', async () => {
    const { fieldMappings } = await harness()
    const template = crypto.randomUUID()
    const mapping = await fieldMappings.upsertForPage(template, 1, [nameField])

    await fieldMappings.delete(mapping.id)

    expect(await fieldMappings.getForPage(template, 1)).toBeUndefined()
  })
})

