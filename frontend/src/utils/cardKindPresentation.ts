import type { CardKind } from '../api'

export type CardKindBadgeVariant = 'kraam' | 'cards'

export function cardKindLabel(kind: CardKind): string {
  return kind === 'avondeten' ? 'Avondetenkaart' : 'Tostikaart'
}

/** Tailwind classes for a small inline badge; variant matches Kraam vs Mijn kaarten styling. */
export function cardKindBadgeClass(kind: CardKind, variant: CardKindBadgeVariant = 'kraam'): string {
  if (variant === 'cards') {
    return kind === 'avondeten'
      ? 'rounded-md bg-amber-200 px-2 py-0.5 normal-case text-amber-950'
      : 'rounded-md bg-indigo-200 px-2 py-0.5 normal-case text-indigo-950'
  }
  return kind === 'avondeten'
    ? 'ml-1 rounded bg-amber-200 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-amber-950'
    : 'ml-1 rounded bg-indigo-200 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-indigo-950'
}
