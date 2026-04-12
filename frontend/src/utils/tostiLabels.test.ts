import { describe, expect, it } from 'vitest'
import { breadLabel, fillingLabel } from './tostiLabels'

describe('breadLabel', () => {
  it('returns short labels without "brood"', () => {
    expect(breadLabel('wit', 'short')).toBe('Wit')
    expect(breadLabel('bruin', 'short')).toBe('Bruin')
  })

  it('returns long labels with "brood"', () => {
    expect(breadLabel('wit', 'long')).toBe('Wit brood')
    expect(breadLabel('bruin', 'long')).toBe('Bruin brood')
    expect(breadLabel('wit')).toBe('Wit brood')
  })
})

describe('fillingLabel', () => {
  it('maps fillings to Dutch labels', () => {
    expect(fillingLabel('ham')).toBe('Ham')
    expect(fillingLabel('kaas')).toBe('Kaas')
    expect(fillingLabel('ham_kaas')).toBe('Ham & kaas')
  })
})
