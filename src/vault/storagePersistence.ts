/**
 * Chrome can evict IndexedDB under storage pressure unless the origin has been
 * granted "persistent" storage — a real risk for an app whose entire point is that
 * the data it holds is the only copy. `navigator.storage` doesn't exist in Vitest's
 * Node environment (or in browsers old enough not to support it), so every function
 * here degrades to an honest "unknown/unavailable" rather than throwing.
 */

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

/** Chrome grants this silently based on site-engagement heuristics rather than a prompt — there's no user-facing permission dialog to wait on, just this one call. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export interface StorageEstimate {
  usageBytes: number
  quotaBytes: number
}

export async function estimateStorageUsage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  if (usage === undefined || quota === undefined) return null
  return { usageBytes: usage, quotaBytes: quota }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}
