import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { queryKeys } from '../queryKeys'
import { useTostiRealtime } from '../useTostiRealtime'
import { cardKindBadgeClass, cardKindLabel } from '../utils/cardKindPresentation'
import { formatEURFromString } from '../utils/formatMoney'
import { breadLabel, fillingLabel } from '../utils/tostiLabels'

/* Dashboard links follow the same routes and role rules as App.tsx and AdminLayout.tsx */

const cardClassName =
  'group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:border-brand-300 hover:shadow-lg'

function DashCard({
  to,
  title,
  description,
  cta,
  children,
  className = '',
}: {
  to: string
  title: string
  description?: string
  cta: string
  children?: ReactNode
  className?: string
}) {
  return (
    <Link to={to} className={`${cardClassName} ${className}`}>
      <div className="text-sm font-semibold text-brand-700">{title}</div>
      {description ? <p className="mt-2 text-slate-600 group-hover:text-slate-800">{description}</p> : null}
      {children}
      <span className="mt-4 inline-block text-sm font-semibold text-brand-700">{cta}</span>
    </Link>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

export function DashboardPage() {
  const { user, pendingCardRequests, paymentAmountEUR, refresh } = useAuth()
  const queryClient = useQueryClient()
  const name = user?.name?.trim() || 'daar'
  const staff = Boolean(user?.is_admin || user?.is_operator)
  const adminOnly = Boolean(user?.is_admin)
  const enabled = Boolean(user)

  const cardsQuery = useQuery({ queryKey: queryKeys.member.myCards, queryFn: () => api.getCards(), enabled })
  const ordersQuery = useQuery({
    queryKey: queryKeys.member.myTostiOrders,
    queryFn: () => api.getMyTostiOrders(),
    enabled,
  })
  const queueQuery = useQuery({ queryKey: queryKeys.member.tostiQueue, queryFn: () => api.getTostiQueue(), enabled })

  const onRealtime = useCallback(
    (reason: string) => {
      if (reason === 'my_tosti_orders' || reason === 'tosti_public_queue') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.member.myTostiOrders })
        void queryClient.invalidateQueries({ queryKey: queryKeys.member.tostiQueue })
        void queryClient.invalidateQueries({ queryKey: queryKeys.member.myCards })
        void refresh()
      }
    },
    [queryClient, refresh],
  )
  useTostiRealtime('/ws/mijn-tosti', enabled, onRealtime, ['my_tosti_orders', 'tosti_public_queue'])

  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data])
  const queue = useMemo(() => queueQuery.data ?? [], [queueQuery.data])
  const myOpenOrders = useMemo(
    () => (ordersQuery.data ?? []).filter((o) => o.status === 'pending'),
    [ordersQuery.data],
  )
  const myQueuePlaces = useMemo(() => {
    const places = new Map<number, number>()
    for (const e of queue) if (e.is_mine) places.set(e.id, e.place)
    return places
  }, [queue])
  const onlineTostiCards = useMemo(() => cards.filter((c) => c.kind === 'tosti' && c.source === 'online'), [cards])
  const freeTostiKnipjes = useMemo(() => {
    const reserved = new Map<number, number>()
    for (const o of myOpenOrders) {
      if (o.card_id !== null) reserved.set(o.card_id, (reserved.get(o.card_id) ?? 0) + o.quantity)
    }
    return onlineTostiCards.reduce((sum, c) => sum + Math.max(0, c.knipjes_remaining - (reserved.get(c.id) ?? 0)), 0)
  }, [onlineTostiCards, myOpenOrders])
  const loading = cardsQuery.isPending || ordersQuery.isPending || queueQuery.isPending

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/40">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Hallo, {name}</h1>
        <p className="mt-2 text-lg text-slate-600">Welkom bij je lunchkraam-overzicht.</p>
      </div>

      <Section title="Lunchkraam">
        <DashCard
          to="/tosti"
          cta="Tosti bestellen →"
          title="Tosti bestellen"
          className="border-brand-200 bg-brand-50/40 sm:col-span-2 lg:col-span-3"
        >
          <p className="mt-2 text-slate-700">
            {loading
              ? 'Laden…'
              : freeTostiKnipjes > 0
                ? `Je hebt ${freeTostiKnipjes} ${freeTostiKnipjes === 1 ? 'vrij knipje' : 'vrije knipjes'} op je digitale tostikaart${
                    onlineTostiCards.length > 1 ? 'en' : ''
                  }.`
                : 'Geen vrije digitale knipjes. Bestellen kan met een fysieke kaart, of koop een nieuwe kaart.'}
          </p>
          {myOpenOrders.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {myOpenOrders.map((o) => {
                const place = myQueuePlaces.get(o.id)
                return (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium text-slate-900">
                      {o.quantity > 1 ? `${o.quantity}× ` : ''}
                      {breadLabel(o.bread)}, {fillingLabel(o.filling)}
                      <span className="text-slate-500">
                        {' '}
                        · {o.is_physical_card ? 'fysieke kaart' : `kaart #${o.card_id}`}
                      </span>
                    </span>
                    <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900">
                      {place ? `Plek ${place} van ${queue.length} in de wachtrij` : 'In de wachtrij'}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : !loading ? (
            <p className="mt-3 text-sm text-slate-500">
              {queue.length === 0
                ? 'De wachtrij is leeg.'
                : `Geen open bestelling. Er ${
                    queue.length === 1 ? 'staat 1 bestelling' : `staan ${queue.length} bestellingen`
                  } in de wachtrij.`}
            </p>
          ) : null}
        </DashCard>

        <DashCard to="/cards" title="Mijn kaarten" cta="Kaarten en historie →">
          {loading ? (
            <p className="mt-2 text-slate-600">Laden…</p>
          ) : cards.length === 0 ? (
            <p className="mt-2 text-slate-600">Je hebt nog geen kaarten.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {cards.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-slate-500">#{c.id}</span>
                    <span className={cardKindBadgeClass(c.kind, 'cards')}>{cardKindLabel(c.kind)}</span>
                    {c.source === 'physical' ? (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">fysiek</span>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {c.knipjes_remaining}
                    <span className="font-normal text-slate-500"> / 10</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard
          to="/buy"
          title="Kaart kopen"
          description={`Nieuwe tostikaart met 10 knipjes voor ${formatEURFromString(
            paymentAmountEUR,
          )}. Betalen via Tikkie of overschrijving.`}
          cta="Kaart kopen →"
        >
          <p className="mt-3 text-sm text-slate-500">
            {pendingCardRequests > 0 ? (
              <>
                Je hebt <strong className="text-slate-800">{pendingCardRequests}</strong> openstaande{' '}
                {pendingCardRequests === 1 ? 'aanvraag' : 'aanvragen'}. De betaling wordt nog gecontroleerd; de kaart kun je
                al gebruiken.
              </>
            ) : (
              'Geen openstaande aanvragen.'
            )}
          </p>
        </DashCard>
      </Section>

      {staff ? (
        <Section title="Kraam en beheer">
          <DashCard
            to="/kraam"
            title="Kraam"
            description="Bestellingen leveren, knipjes en historie, avondeten, kaartverkoop en de betalingswachtrij."
            cta="Open kraam →"
          />
          <DashCard
            to="/admin"
            title="Overzicht"
            description="Omzet, uitgaven, tosti's en grafieken per jaar."
            cta="Open overzicht →"
          />
          <DashCard
            to="/admin/finance"
            title="Financiën"
            description="Revolut-bankregels koppelen aan verkopen."
            cta="Open financiën →"
          />
          <DashCard
            to="/admin/finance-control"
            title="Verkoopcontrole"
            description="Maandvergelijking Revolut-import tegenover app-omzet."
            cta="Open verkoopcontrole →"
          />
          <DashCard
            to="/admin/expenses"
            title="Boodschappen"
            description="Bonnetjes, uitgaven en Revolut-import."
            cta="Open boodschappen →"
          />
          {adminOnly ? (
            <DashCard
              to="/admin/accounts"
              title="Accounts"
              description="Rechten, jeugd-vlag, activeren en kaarten per lid."
              cta="Open accounts →"
            />
          ) : null}
          {adminOnly ? (
            <DashCard
              to="/admin/settings"
              title="Instellingen"
              description="Prijzen, Tikkie-links en overschrijfinstructies."
              cta="Open instellingen →"
            />
          ) : null}
        </Section>
      ) : null}

      {user?.auth_kind === 'local' ? (
        <Section title="Account">
          <DashCard
            to="/account/password"
            title="Wachtwoord wijzigen"
            description="Stel een nieuw wachtwoord in voor je lokale account."
            cta="Wachtwoord wijzigen →"
          />
        </Section>
      ) : null}
    </div>
  )
}
