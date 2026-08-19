export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens and stops letting calls through. */
  failureThreshold: number
  /** How long the circuit stays open before allowing one trial call through (half-open) to test recovery. */
  cooldownMs: number
}

/**
 * Per-provider failure tracking so one struggling LLM provider (rate-limited,
 * down, or genuinely unreachable) doesn't get hammered with retries — every call
 * after the threshold fails instantly instead of waiting out a real network
 * timeout, and the caller (Chunk 38's LlmProvider layer) gets a clear, distinct
 * reason to show "temporarily unavailable" rather than a generic error. `now`
 * defaults to the real clock but is injectable so cooldown behavior is testable
 * without a real 30-second wait.
 */
export class CircuitBreaker {
  #consecutiveFailures = 0
  #openedAt: number | null = null
  #options: CircuitBreakerOptions
  #now: () => number

  constructor(options: CircuitBreakerOptions, now: () => number = Date.now) {
    this.#options = options
    this.#now = now
  }

  get state(): CircuitState {
    if (this.#openedAt === null) return 'closed'
    if (this.#now() - this.#openedAt >= this.#options.cooldownMs) return 'half-open'
    return 'open'
  }

  /** Whether a call should even be attempted right now — false only while genuinely open (mid-cooldown). */
  canAttempt(): boolean {
    return this.state !== 'open'
  }

  recordSuccess(): void {
    this.#consecutiveFailures = 0
    this.#openedAt = null
  }

  recordFailure(): void {
    this.#consecutiveFailures += 1
    if (this.#consecutiveFailures >= this.#options.failureThreshold) {
      this.#openedAt = this.#now()
    }
  }
}
