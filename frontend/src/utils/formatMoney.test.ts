import { describe, expect, it } from 'vitest'
import { formatEUR, formatEURFromString, roundCents } from './formatMoney'

describe('roundCents', () => {
  it('rounds to two decimal places', () => {
    expect(roundCents(3.144)).toBe(3.14)
    expect(roundCents(10.999)).toBe(11)
  })
})

describe('formatEUR', () => {
  it('formats in nl-NL locale', () => {
    const s = formatEUR(12.5)
    expect(s).toContain('12')
    expect(s).toMatch(/€/)
  })
})

describe('formatEURFromString', () => {
  it('accepts dot and comma decimals', () => {
    expect(formatEURFromString('15')).toBe(formatEUR(15))
    expect(formatEURFromString('12,5')).toBe(formatEUR(12.5))
  })
})
