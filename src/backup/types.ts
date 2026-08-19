import type { CaseContent, PartyContent } from '../cases/types'
import type { DeadlineContent } from '../deadlines/types'
import type { DocumentContent } from '../documents/types'
import type { FieldMappingContent, PdfTemplateContent } from '../pdf/types'
import type { ProofOfServiceContent } from '../service/types'

interface RecordMeta {
  id: string
  createdAt: number
  updatedAt: number
}

export interface BackupCase extends RecordMeta {
  content: CaseContent
}

export interface BackupParty extends RecordMeta {
  caseId: string
  content: PartyContent
}

/** File bytes travel as base64 — the whole manifest becomes one JSON document before it's encrypted (see backupFile.ts), and JSON has no binary type. */
export interface BackupDocument extends RecordMeta {
  caseId: string
  content: DocumentContent
  fileBase64: string
}

export interface BackupDeadline extends RecordMeta {
  caseId: string
  content: DeadlineContent
}

export interface BackupPdfTemplate extends RecordMeta {
  content: PdfTemplateContent
  fileBase64: string
}

export interface BackupFieldMapping extends RecordMeta {
  templateId: string
  content: FieldMappingContent
}

export interface BackupProofOfService extends RecordMeta {
  caseId: string
  content: ProofOfServiceContent
}

export const BACKUP_MANIFEST_VERSION = 1

/**
 * A full, decrypted dump of every store in the app — the intermediate shape
 * between "what's in IndexedDB" and "what's in a `.plcmbackup` file." Building this
 * as its own explicit step (rather than encrypting straight from Dexie records)
 * means the backup format is defined by real content types, not by incidentally
 * whatever `Stored*Record` happens to look like.
 */
export interface BackupManifest {
  version: number
  createdAt: number
  cases: BackupCase[]
  parties: BackupParty[]
  documents: BackupDocument[]
  deadlines: BackupDeadline[]
  pdfTemplates: BackupPdfTemplate[]
  fieldMappings: BackupFieldMapping[]
  proofOfService: BackupProofOfService[]
}
