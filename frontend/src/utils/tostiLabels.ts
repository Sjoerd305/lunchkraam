import type { TostiBread, TostiFilling } from '../api'

/** `short`: Wit / Bruin (append " brood" in UI if needed). `long`: Wit brood / Bruin brood. */
export function breadLabel(b: TostiBread, style: 'short' | 'long' = 'long'): string {
  if (b === 'bruin') {
    return style === 'long' ? 'Bruin brood' : 'Bruin'
  }
  return style === 'long' ? 'Wit brood' : 'Wit'
}

export function fillingLabel(f: TostiFilling): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}
