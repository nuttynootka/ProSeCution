import type { VaultService } from './VaultService'

/**
 * Wraps encrypted JSON content with a version tag, per the blueprint's requirement
 * that JSON columns carry an explicit version. This versions the *decrypted content
 * shape* (do old records have the fields new code expects?) — a separate concern
 * from a Dexie schema version, which versions the plain indexed columns.
 * A content-shape change (e.g. a later chunk renaming a field) bumps `CONTENT_VERSION`
 * and adds a case in `migrateContent`; it never touches a db.ts schema.
 *
 * Generic over the stored shape, so every module with its own encrypted record type
 * (cases, documents, and whatever comes after) shares this rather than each growing
 * its own copy.
 */
const CONTENT_VERSION = 1

interface Envelope<T> {
  v: number
  data: T
}

export async function encryptContent<T>(vault: VaultService, data: T): Promise<string> {
  const envelope: Envelope<T> = { v: CONTENT_VERSION, data }
  return vault.encryptField(JSON.stringify(envelope))
}

export async function decryptContent<T>(vault: VaultService, packed: string): Promise<T> {
  const json = await vault.decryptField(packed)
  const envelope = JSON.parse(json) as Envelope<T>
  return migrateContent<T>(envelope)
}

/**
 * No versions to migrate from yet — this is where a future content-version bump
 * adds its upgrade logic, keyed on `envelope.v`.
 */
function migrateContent<T>(envelope: Envelope<T>): T {
  return envelope.data
}
