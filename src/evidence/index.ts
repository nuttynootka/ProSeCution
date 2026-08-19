import { db, vault } from '../vault'
import { ExhibitListRepository } from './ExhibitListRepository'

export { exhibitLabel } from './exhibitLabels'
export { generateExhibitCoverSheets, generateExhibitList } from './exhibitDocuments'
export type { ExhibitEntry } from './exhibitDocuments'
export { ExhibitListRepository } from './ExhibitListRepository'
export type { ExhibitItem, ExhibitListContent } from './ExhibitListRepository'

/** App-wide repository instance, wired to the app's real database and vault. */
export const exhibitListRepository = new ExhibitListRepository(db, vault)
