import { db } from './db'
import { VaultService } from './VaultService'

/** App-wide vault instance, wired to the app's real IndexedDB database. */
export const vault = new VaultService(db)

export { PlcmDatabase, db } from './db'
export type { VaultMetaRecord } from './db'
export {
  VaultService,
  VaultAlreadySetUpError,
  VaultLockedError,
  VaultNotSetUpError,
} from './VaultService'
export { IncorrectPassphraseError } from './crypto'
