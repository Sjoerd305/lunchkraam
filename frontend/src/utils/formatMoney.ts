/**
 * Euro formatting for display (admin UI, charts). Uses Dutch locale and EUR.
 */
export function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Formats a loose amount string from the API (comma or dot decimal) as EUR for display. */
export function formatEURFromString(s: string): string {
  const n = parseFloat(String(s).trim().replace(',', '.'))
  return formatEUR(Number.isFinite(n) ? n : 0)
}

/** Rounds a float to two decimals (cents), matching server-side EUR rounding. */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}
