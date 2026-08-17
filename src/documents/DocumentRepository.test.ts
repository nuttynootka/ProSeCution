import { afterEach, describe, expect, it } from 'vitest'
import { VaultLockedError } from '../vault/VaultService'
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

function textBlob(text: string, type = 'text/plain'): Blob {
  return new Blob([text], { type })
}

describe('create', () => {
  it('returns the document with an id, caseId, and derived metadata', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    const doc = await documents.create(c.id, textBlob('hello'), 'summons.txt')

    expect(doc.id).toBeTruthy()
    expect(doc.caseId).toBe(c.id)
    expect(doc.originalFilename).toBe('summons.txt')
    expect(doc.mimeType).toBe('text/plain')
    expect(doc.sizeBytes).toBe(5)
  })

  it('stores content encrypted — neither the metadata nor the file bytes are plaintext in the raw record', async () => {
    const { db, cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    await documents.create(c.id, textBlob('THE-SECRET-DOCUMENT-CONTENTS'), 'distinctive-filename.txt')

    const [raw] = await db.documents.toArray()
    expect(JSON.stringify(raw.dataEnc)).not.toContain('distinctive-filename')
    // fileCiphertext is a Uint8Array, not a string — check byte-for-byte, not via a
    // string search that Uint8Array->string coercion could make misleadingly pass.
    const plaintextBytes = new TextEncoder().encode('THE-SECRET-DOCUMENT-CONTENTS')
    expect(containsSubsequence(raw.fileCiphertext, plaintextBytes)).toBe(false)
  })
})

function containsSubsequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

describe('get', () => {
  it('returns metadata without needing to decrypt the file', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const created = await documents.create(c.id, textBlob('content'), 'exhibit-a.txt')

    const fetched = await documents.get(created.id)

    expect(fetched).toEqual(created)
  })

  it('returns undefined for an unknown id', async () => {
    const { documents } = await harness()
    expect(await documents.get('does-not-exist')).toBeUndefined()
  })
})

describe('getFileBlob', () => {
  it('round-trips the exact file content and mime type', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const original = textBlob('Motion to Dismiss — full text here.', 'text/plain')
    const created = await documents.create(c.id, original, 'motion.txt')

    const retrieved = await documents.getFileBlob(created.id)

    expect(retrieved?.type).toBe('text/plain')
    expect(await retrieved?.text()).toBe('Motion to Dismiss — full text here.')
  })

  it('round-trips binary content correctly, not just text', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64])
    const created = await documents.create(c.id, new Blob([bytes], { type: 'application/octet-stream' }), 'scan.bin')

    const retrieved = await documents.getFileBlob(created.id)
    const retrievedBytes = new Uint8Array(await retrieved!.arrayBuffer())

    expect(retrievedBytes).toEqual(bytes)
  })

  it('returns undefined for an unknown id', async () => {
    const { documents } = await harness()
    expect(await documents.getFileBlob('does-not-exist')).toBeUndefined()
  })
})

describe('listForCase', () => {
  it('returns only documents belonging to the given case, most recent first', async () => {
    const { cases, documents } = await harness()
    const caseA = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const caseB = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })

    const first = await documents.create(caseA.id, textBlob('a'), 'a.txt')
    const second = await documents.create(caseA.id, textBlob('b'), 'b.txt')
    await documents.create(caseB.id, textBlob('c'), 'c.txt')

    const forCaseA = await documents.listForCase(caseA.id)

    expect(forCaseA.map((d) => d.id)).toEqual([second.id, first.id])
  })

  it('returns an empty array for a case with no documents', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    expect(await documents.listForCase(c.id)).toEqual([])
  })
})

describe('delete', () => {
  it('removes the document', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const created = await documents.create(c.id, textBlob('x'), 'x.txt')

    await documents.delete(created.id)

    expect(await documents.get(created.id)).toBeUndefined()
  })
})

describe('cascade from CaseRepository.delete', () => {
  it('deleting a case deletes every document attached to it', async () => {
    const { cases, documents } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    await documents.create(c.id, textBlob('a'), 'a.txt')
    await documents.create(c.id, textBlob('b'), 'b.txt')

    await cases.delete(c.id)

    expect(await documents.listForCase(c.id)).toEqual([])
  })

  it('does not affect documents belonging to a different case', async () => {
    const { cases, documents } = await harness()
    const caseA = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const caseB = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const docB = await documents.create(caseB.id, textBlob('b'), 'b.txt')

    await cases.delete(caseA.id)

    expect(await documents.get(docB.id)).toEqual(docB)
  })
})

describe('when the vault is locked', () => {
  it('create rejects with VaultLockedError', async () => {
    const { cases, documents, vault } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    vault.lock()

    await expect(documents.create(c.id, textBlob('x'), 'x.txt')).rejects.toThrow(VaultLockedError)
  })

  it('getFileBlob rejects with VaultLockedError rather than returning ciphertext', async () => {
    const { cases, documents, vault } = await harness()
    const c = await cases.create({ state: 'CA', county: 'LA', caseType: 'Civil' })
    const created = await documents.create(c.id, textBlob('x'), 'x.txt')
    vault.lock()

    await expect(documents.getFileBlob(created.id)).rejects.toThrow(VaultLockedError)
  })
})
