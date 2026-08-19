import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from './circuitBreaker'

describe('CircuitBreaker', () => {
  it('starts closed, allowing calls through', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    expect(cb.state).toBe('closed')
    expect(cb.canAttempt()).toBe(true)
  })

  it('stays closed below the failure threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.state).toBe('closed')
  })

  it('opens once consecutive failures reach the threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.state).toBe('open')
    expect(cb.canAttempt()).toBe(false)
  })

  it('a success resets the failure count and closes the circuit', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    cb.recordFailure()
    cb.recordFailure()
    cb.recordSuccess()
    cb.recordFailure()
    cb.recordFailure()
    // Two failures since the last success — still below threshold of 3.
    expect(cb.state).toBe('closed')
  })

  it('moves to half-open after the cooldown elapses, and allows one attempt through', () => {
    let now = 0
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 }, () => now)
    cb.recordFailure()
    expect(cb.state).toBe('open')
    now = 999
    expect(cb.state).toBe('open')
    now = 1000
    expect(cb.state).toBe('half-open')
    expect(cb.canAttempt()).toBe(true)
  })

  it('a failure during half-open re-opens the circuit for another full cooldown', () => {
    let now = 0
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 }, () => now)
    cb.recordFailure()
    now = 1000 // half-open
    cb.recordFailure() // the trial call failed
    expect(cb.state).toBe('open')
    now = 1999
    expect(cb.state).toBe('open')
    now = 2000
    expect(cb.state).toBe('half-open')
  })
})
