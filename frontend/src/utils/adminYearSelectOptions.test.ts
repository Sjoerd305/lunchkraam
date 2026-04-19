import { describe, expect, it } from 'vitest'
import { adminYearSelectOptions } from './adminYearSelectOptions'

describe('adminYearSelectOptions', () => {
  it('merges API years with current calendar year and sorts descending', () => {
    const yNow = new Date().getFullYear()
    expect(adminYearSelectOptions([2022, yNow - 1], null)).toEqual([yNow, yNow - 1, 2022])
  })

  it('includes selected year when API list is empty', () => {
    const yNow = new Date().getFullYear()
    expect(adminYearSelectOptions([], 2019)).toEqual([yNow, 2019])
  })

  it('defaults to current year when list and selection are empty', () => {
    const yNow = new Date().getFullYear()
    expect(adminYearSelectOptions([], null)).toEqual([yNow])
  })
})
