/**
 * Build sorted year values for an admin year dropdown (`<select>`):
 * API list, always include the current calendar year, and keep the active
 * selection visible if it is not returned by the API (e.g. edge cases).
 */
export function adminYearSelectOptions(
  yearsFromApi: readonly number[] | undefined,
  selectedYear: number | null,
): number[] {
  const yearsList = yearsFromApi ?? []
  const yNow = new Date().getFullYear()
  const base =
    yearsList.length > 0 ? [...yearsList] : selectedYear !== null ? [selectedYear] : [yNow]
  const s = new Set(base)
  s.add(yNow)
  return Array.from(s).sort((a, b) => b - a)
}
