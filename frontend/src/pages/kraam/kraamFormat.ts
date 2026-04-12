import type { CardKind, OperatorTostiOrderRow } from '../../api'

export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isPhysicalTostiOrder(o: OperatorTostiOrderRow): boolean {
  return o.is_physical_card
}

export function formatAmsterdamDateLong(yyyyMMdd: string): string {
  const p = yyyyMMdd.split('-').map(Number)
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return yyyyMMdd
  const [y, m, d] = p
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function cardKindLabel(kind: CardKind): string {
  return kind === 'avondeten' ? 'Avondetenkaart' : 'Tostikaart'
}

export function cardKindBadgeClass(kind: CardKind): string {
  return kind === 'avondeten'
    ? 'ml-1 rounded bg-amber-200 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-amber-950'
    : 'ml-1 rounded bg-indigo-200 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-indigo-950'
}
