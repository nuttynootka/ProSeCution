import { db, vault } from '../vault'
import { DocumentRepository } from './DocumentRepository'

/** App-wide repository instance, wired to the app's real database and vault. */
export const documentRepository = new DocumentRepository(db, vault)

export { DocumentNotFoundError, DocumentRepository } from './DocumentRepository'
export type { Document, DocumentContent } from './types'
