import { describe, expect, it } from 'vitest'
import { formatBytes } from './storagePersistence'

describe('formatBytes', () => {
  it('shows raw bytes under 1KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('shows one decimal place under 10 of a unit', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('shows whole numbers at 10 or more of a unit', () => {
    expect(formatBytes(15 * 1024)).toBe('15 KB')
  })

  it('scales up through MB and GB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })
})
