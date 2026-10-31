import { describe, expect, it } from 'vitest'
import { formatDelta, transactionIsUndoable, transactionReasonLabel } from './cardTransactionLabels'

describe('cardTransactionLabels', () => {
  it('formats deltas with an explicit sign', () => {
    expect(formatDelta(2)).toBe('+2')
    expect(formatDelta(-1)).toBe('−1')
    expect(formatDelta(0)).toBe('0')
  })

  it('only allows undo for real debits and estimate changes', () => {
    expect(transactionIsUndoable('tosti_delivered')).toBe(true)
    expect(transactionIsUndoable('avondeten_meal')).toBe(true)
    expect(transactionIsUndoable('manual_knipje')).toBe(true)
    expect(transactionIsUndoable('estimate_adjust')).toBe(true)
    expect(transactionIsUndoable('issued')).toBe(false)
    expect(transactionIsUndoable('undo')).toBe(false)
    expect(transactionIsUndoable('backfill')).toBe(false)
  })

  it('has a Dutch label for every reason', () => {
    expect(transactionReasonLabel('issued')).toBe('Kaart uitgegeven')
    expect(transactionReasonLabel('backfill')).toContain('Correctie')
  })
})
