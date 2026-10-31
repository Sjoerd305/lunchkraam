import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { CardHistoryPanel } from '../components/CardHistoryPanel'
import { KnipDots } from '../components/KnipDots'
import { useAlertDialog } from '../components/useAlertDialog'
import { useQueryErrorAlert } from '../hooks/useQueryErrorAlert'
import { queryKeys } from '../queryKeys'
import { cardKindLabel } from '../utils/cardKindPresentation'
import { formatDateNL } from '../utils/cardTransactionLabels'

export function CardsPage() {
  const { user, refresh } = useAuth()
  const { alert } = useAlertDialog()
  const queryClient = useQueryClient()
  const [openHistory, setOpenHistory] = useState<Set<number>>(new Set())

  const cardsQuery = useQuery({
    queryKey: queryKeys.member.myCards,
    queryFn: () => api.getCards(),
    enabled: Boolean(user),
  })
  const ordersQuery = useQuery({
    queryKey: queryKeys.member.myTostiOrders,
    queryFn: () => api.getMyTostiOrders(),
    enabled: Boolean(user),
  })
  useQueryErrorAlert(cardsQuery, { title: 'Kaarten laden mislukt', alert })

  const cards = cardsQuery.data ?? []
  const reservedByCard = useMemo(() => {
    const m = new Map<number, number>()
    for (const o of ordersQuery.data ?? []) {
      if (o.status === 'pending' && o.card_id !== null) m.set(o.card_id, (m.get(o.card_id) ?? 0) + o.quantity)
    }
    return m
  }, [ordersQuery.data])

  function toggleHistory(id: number) {
    setOpenHistory((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  if (cardsQuery.isPending) {
    return <p className="text-ink-muted">Kaarten laden…</p>
  }

  if (cardsQuery.isError && cards.length === 0) {
    return (
      <div className="surface-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="text-ink-muted">Je kaarten konden niet worden geladen.</p>
        <button type="button" onClick={() => void cardsQuery.refetch()} className="btn-primary w-full max-w-xs">
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="surface-card border-dashed p-10 text-center">
        <p className="text-ink-muted">
          Je hebt nog geen kaarten.{' '}
          <Link to="/buy" className="font-semibold text-brand-900 underline">
            Koop een kaart
          </Link>
          . Bestellen kan direct na je aanvraag; de kaart wordt actief zodra de kraam je betaling heeft gecontroleerd.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Mijn kaarten</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tosti's bestel je via{' '}
          <Link to="/tosti" className="font-semibold text-brand-900 underline">
            Tosti bestellen
          </Link>
          ; de kraam schrijft knipjes af bij levering. Per kaart zie je hier de volledige historie.
          {user?.is_matroos_jeugd ? ' Avondeten wordt door de kraam per datum afgeboekt.' : ''}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const reserved = reservedByCard.get(c.id) ?? 0
          const showHistory = openHistory.has(c.id)
          return (
            <article key={c.id} className="surface-card flex flex-col p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow text-brand-900">{cardKindLabel(c.kind)}</span>
                <span className="flex items-center gap-2">
                  {c.source === 'physical' ? <span className="pill-neutral">Fysiek · schatting</span> : null}
                  {!c.active ? <span className="pill-pending">Nog niet actief</span> : null}
                  <span className="text-xs font-medium text-ink-muted">#{c.id}</span>
                </span>
              </div>
              <KnipDots remaining={c.knipjes_remaining} className="mt-4" />
              <p className="mt-4 font-display text-3xl font-semibold leading-none text-ink">
                {c.knipjes_remaining}
                <span className="font-sans text-base font-medium text-ink-muted"> van 10</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                knipjes over
                {reserved > 0 ? (
                  <span>
                    {' '}
                    · {reserved} gereserveerd in {reserved === 1 ? 'een open bestelling' : 'open bestellingen'}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Uitgegeven op {formatDateNL(c.created_at)}</p>
              {c.source === 'physical' ? (
                <p className="mt-2 text-xs text-accent-800">
                  De kraam knipt op je echte kaart; dit getal is een schatting die de kraam kan bijstellen.
                </p>
              ) : null}
              {!c.active ? (
                <p className="mt-2 text-xs text-accent-800">
                  Je betaling wordt nog gecontroleerd. Bestellen kan alvast; de kraam levert zodra de kaart actief is.
                </p>
              ) : null}
              {c.knipjes_remaining === 0 ? (
                <Link to="/buy" className="btn-accent mt-4 w-full">
                  Deze kaart is op · nieuwe kaart kopen
                </Link>
              ) : null}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => toggleHistory(c.id)}
                  className="text-sm font-semibold text-brand-900 hover:underline"
                  aria-expanded={showHistory}
                >
                  {showHistory ? 'Historie verbergen' : 'Historie bekijken'}
                </button>
                {showHistory ? (
                  <div className="mt-3">
                    <CardHistoryPanel
                      cardId={c.id}
                      onChanged={async () => {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.member.myCards })
                        await refresh()
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
