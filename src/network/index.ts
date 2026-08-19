import { db, vault } from '../vault'
import { OfflineQueueRepository } from './OfflineQueueRepository'

export { CircuitBreaker } from './circuitBreaker'
export type { CircuitBreakerOptions, CircuitState } from './circuitBreaker'
export { OfflineQueueRepository } from './OfflineQueueRepository'
export type { OfflineQueueItem, OfflineQueueItemContent } from './OfflineQueueRepository'
export { replayOfflineQueue } from './backgroundReplay'
export type { ReplayResult } from './backgroundReplay'

export const offlineQueueRepository = new OfflineQueueRepository(db, vault)
