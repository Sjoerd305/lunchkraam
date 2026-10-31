import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { CardHistoryPanel } from '../components/CardHistoryPanel'
import { useAlertDialog } from '../components/useAlertDialog'
import { useQueryErrorAlert } from '../hooks/useQueryErrorAlert'
import { queryKeys } from '../queryKeys'
import { cardKindBadgeClass, cardKindLabel } from '../utils/cardKindPresentation'
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
    return <p className="text-slate-600">Kaarten laden…</p>
  }

  if (cardsQuery.isError && cards.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Je kaarten konden niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void cardsQuery.refetch()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-inner">
        <p className="text-slate-600">
          Je hebt nog geen kaarten.{' '}
          <Link to="/buy" className="font-semibold text-brand-700 underline">
            Koop een kaart
          </Link>
          . De knipjes zijn meteen bruikbaar bij Tosti bestellen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mijn kaarten</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tosti's bestel je via{' '}
          <Link to="/tosti" className="font-semibold text-brand-700 underline">
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
            <article key={c.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Kaart #{c.id}</span>
                <span className={cardKindBadgeClass(c.kind, 'cards')}>{cardKindLabel(c.kind)}</span>
                {c.source === 'physical' ? (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 normal-case text-amber-900">
                    Fysieke kaart (schatting)
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-3xl font-bold text-brand-800">
                {c.knipjes_remaining}
                <span className="text-lg font-medium text-slate-500"> / 10</span>
              </p>
              <p className="text-sm text-slate-600">
                knipjes over
                {reserved > 0 ? (
                  <span className="text-slate-500">
                    {' '}
                    · {reserved} gereserveerd in {reserved === 1 ? 'een open bestelling' : 'open bestellingen'}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-slate-500">Uitgegeven op {formatDateNL(c.created_at)}</p>
              {c.source === 'physical' ? (
                <p className="mt-2 text-xs text-amber-900/90">
                  De kraam knipt op je echte kaart; dit getal is een schatting die de kraam kan bijstellen.
                </p>
              ) : null}
              {c.knipjes_remaining === 0 ? <p className="mt-2 text-sm text-slate-500">Deze kaart is op.</p> : null}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => toggleHistory(c.id)}
                  className="text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
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
