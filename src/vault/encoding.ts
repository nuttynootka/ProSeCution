/**
 * Base64 helpers for turning encrypted field bytes into strings Dexie/IndexedDB can
 * store as plain text. `btoa`/`atob` operate on "binary strings" (one char per byte,
 * not UTF-16 text), so bytes are mapped through that one at a time rather than via
 * String.fromCharCode(...array), which blows the call stack on large inputs.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
