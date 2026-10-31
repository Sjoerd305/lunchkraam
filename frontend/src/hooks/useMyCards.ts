import { useQuery } from '@tanstack/react-query'
import * as api from '../api'
import { queryKeys } from '../queryKeys'
import { useAuth } from '../useAuth'

/** Mijn kaarten (gedeelde query; AppShell, dashboard en kaartenpagina gebruiken dezelfde key). */
export function useMyCards(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.member.myCards,
    queryFn: () => api.getCards(),
    enabled: enabled && Boolean(user),
  })
}

/**
 * De "actieve" tostikaart voor het logo: de oudste digitale tostikaart met knipjes over.
 * Zijn alle tostikaarten op → de laatste (10 happen). Geen tostikaart → null (hele boterham).
 */
export function activeTostiCard(cards: readonly api.Card[] | undefined): api.Card | null {
  if (!cards) return null
  const tosti = cards
    .filter((c) => c.kind === 'tosti' && c.source !== 'physical')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (tosti.length === 0) return null
  return tosti.find((c) => c.knipjes_remaining > 0) ?? tosti[tosti.length - 1]
}
