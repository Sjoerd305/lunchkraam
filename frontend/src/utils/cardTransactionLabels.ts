import type { CardTransactionReason } from '../api'

export function transactionReasonLabel(reason: CardTransactionReason): string {
  switch (reason) {
    case 'issued':
      return 'Kaart uitgegeven'
    case 'tosti_delivered':
      return 'Tosti geleverd'
    case 'avondeten_meal':
      return 'Avondeten'
    case 'manual_knipje':
      return 'Handmatig knipje'
    case 'estimate_adjust':
      return 'Schatting aangepast'
    case 'undo':
      return 'Teruggedraaid'
    case 'backfill':
      return 'Correctie (vóór logboek)'
    default:
      return reason
  }
}

/** Boekingen die een kraammedewerker mag terugdraaien. */
export function transactionIsUndoable(reason: CardTransactionReason): boolean {
  return (
    reason === 'tosti_delivered' ||
    reason === 'avondeten_meal' ||
    reason === 'manual_knipje' ||
    reason === 'estimate_adjust'
  )
}

/** +2 / −1 / 0 met een echt minteken. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return `−${Math.abs(delta)}`
  return '0'
}

export function formatDateTimeNL(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDateNL(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('nl-NL', { dateStyle: 'medium' })
}
