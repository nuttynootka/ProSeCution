// Dexie needs IndexedDB, which Node doesn't provide; this polyfills it globally for
// the test process. Node 22's built-in Web Crypto (globalThis.crypto) needs no
// polyfill.
import 'fake-indexeddb/auto'
