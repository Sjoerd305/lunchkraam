import { useQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { KnipDots } from '../components/KnipDots'
import { useMyCards } from '../hooks/useMyCards'
import { queryKeys } from '../queryKeys'
import { useAuth } from '../useAuth'
import { cardKindLabel } from '../utils/cardKindPresentation'
import { formatDateNL } from '../utils/cardTransactionLabels'
import { formatEURFromString } from '../utils/formatMoney'
import { breadLabel, fillingLabel } from '../utils/tostiLabels'

/* Dashboard links follow the same routes and role rules as App.tsx and AdminLayout.tsx */

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

export function DashboardPage() {
  const { user, pendingCardRequests } = useAuth()
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'daar'
  const staff = Boolean(user?.is_admin || user?.is_operator)
  const adminOnly = Boolean(user?.is_admin)
  const now = new Date()
  const dateLabel = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  const cardsQuery = useMyCards()
  const buyQuery = useQuery({
    queryKey: queryKeys.member.buyInfo,
    queryFn: () => api.getBuyInfo(),
    enabled: Boolean(user),
  })
  const queueQuery = useQuery({
    queryKey: queryKeys.member.tostiQueue,
    queryFn: () => api.getTostiQueue(),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  })

  const cards = [...(cardsQuery.data ?? [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'tosti' ? -1 : 1
    return a.created_at.localeCompare(b.created_at)
  })
  const pendingByKind = new Map<api.CardKind, api.MyPendingRequest>()
  for (const r of buyQuery.data?.my_pending_requests ?? []) {
    if (!pendingByKind.has(r.kind)) pendingByKind.set(r.kind, r)
  }
  const myQueue = (queueQuery.data ?? []).filter((e) => e.is_mine)
  const queue = queueQuery.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight text-ink sm:text-4xl">
            {greeting(now)}, {firstName}
          </h1>
        </div>
        <Link to="/tosti" className="btn-accent min-h-12 px-5 text-base">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Tosti bestellen
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-ink">Mijn kaarten</h2>
            <Link to="/cards" className="text-sm font-semibold text-brand-900 hover:underline">
              Alle kaarten
            </Link>
          </div>

          {cardsQuery.isPending ? (
            <p className="text-ink-muted">Kaarten laden…</p>
          ) : cards.length === 0 ? (
            <div className="surface-card border-dashed text-center">
              <p className="text-ink-muted">Je hebt nog geen kaart.</p>
              <Link to="/buy" className="btn-primary mt-4">
                Kaart kopen
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {cards.map((c) => {
                const pending = pendingByKind.get(c.kind)
                return (
                  <article key={c.id} className="surface-card flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="eyebrow text-brand-900">{cardKindLabel(c.kind)}</span>
                      {c.source === 'physical' ? (
                        <span className="pill-neutral">Fysiek · schatting</span>
                      ) : pending ? (
                        <span className="pill-pending">Betaling in controle</span>
                      ) : (
                        <span className="text-xs font-medium text-ink-muted">Sinds {formatDateNL(c.created_at)}</span>
                      )}
                    </div>
                    <KnipDots remaining={c.knipjes_remaining} />
                    <p className="font-display text-3xl font-semibold leading-none text-ink">
                      {c.knipjes_remaining}{' '}
                      <span className="font-sans text-base font-medium text-ink-muted">van 10 knipjes over</span>
                    </p>
                    {c.knipjes_remaining === 0 ? (
                      <Link to="/buy" className="btn-accent w-full">
                        Deze kaart is op · nieuwe kaart kopen
                      </Link>
                    ) : c.kind === 'tosti' ? (
                      <Link to="/tosti" className="btn-secondary w-full">
                        Tosti bestellen met deze kaart
                      </Link>
                    ) : (
                      <p className="text-sm text-ink-muted">De kraam boekt avondeten per datum af.</p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <h2 className="text-xl font-semibold text-ink">Vandaag bij de kraam</h2>

          <section className="rounded-[14px] bg-brand-900 p-5 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.05em] text-brand-200">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-400" />
              Tosti-wachtrij · live
            </div>
            {queueQuery.isPending ? (
              <p className="mt-3 text-sm text-brand-200">Wachtrij laden…</p>
            ) : myQueue.length > 0 ? (
              <>
                <p className="mt-3 font-display text-2xl font-semibold leading-tight">
                  Je bent nummer {myQueue[0].place}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-brand-200">
                  {myQueue[0].place === 1
                    ? 'Jij bent aan de beurt.'
                    : `${myQueue[0].place - 1} ${myQueue[0].place === 2 ? 'bestelling gaat' : 'bestellingen gaan'} voor je.`}{' '}
                  {myQueue[0].quantity > 1 ? `${myQueue[0].quantity}× ` : ''}
                  {breadLabel(myQueue[0].bread, 'short')}, {fillingLabel(myQueue[0].filling)}.
                </p>
                <Link to="/tosti" className="mt-3 inline-block text-sm font-semibold text-accent-400">
                  Bestelling bekijken
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 font-display text-2xl font-semibold leading-tight">
                  {queue.length === 0 ? 'Geen wachtrij' : `${queue.length} in de wachtrij`}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-brand-200">
                  {queue.length === 0 ? 'Je tosti kan meteen op het ijzer.' : 'Bestel nu, dan sta je erachter.'}
                </p>
              </>
            )}
          </section>

          {pendingCardRequests > 0 ? (
            <Panel title="Openstaande aanvraag">
              <p className="text-sm leading-relaxed text-ink-muted">
                {pendingCardRequests === 1 ? 'Je kaartaanvraag wordt' : `${pendingCardRequests} kaartaanvragen worden`}{' '}
                door de kraam gecontroleerd. Je kaart is al bruikbaar.
              </p>
              <Link to="/buy" className="text-sm font-semibold text-brand-900 hover:underline">
                Betaalgegevens bekijken
              </Link>
            </Panel>
          ) : null}

          <Panel title="Nieuwe kaart nodig?">
            <p className="text-sm leading-relaxed text-ink-muted">
              Tostikaart {formatEURFromString(buyQuery.data?.payment_amount_eur ?? '')}
              {user?.is_matroos_jeugd
                ? ` · Avondetenkaart ${formatEURFromString(buyQuery.data?.payment_amount_avondeten_eur ?? '')}`
                : ''}
              . Knipjes zijn meteen bruikbaar.
            </p>
            <Link to="/buy" className="btn-primary self-start">
              Kaart kopen
            </Link>
          </Panel>
        </aside>
      </div>

      {staff ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Voor de kraam</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink to="/kraam" title="Kraam" description="Wachtrij, betalingen, fysieke verkoop, avondeten." />
            <QuickLink to="/admin/requests" title="Betalingswachtrij" description="Accordeer of weiger openstaande betalingen." />
            <QuickLink to="/admin/expenses" title="Boodschappen" description="Bonnetjes en uitgaven registreren." />
            {adminOnly ? (
              <QuickLink to="/admin" title="Beheer" description="Cijfers, accounts en instellingen." />
            ) : (
              <QuickLink to="/admin/expenses-overview" title="Overzichten" description="Financieel overzicht en statistieken." />
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface-card flex flex-col gap-2.5 p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

function QuickLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to} className="surface-card group flex flex-col gap-1 p-5 transition-colors hover:border-brand-300">
      <span className="font-semibold text-brand-900">{title} →</span>
      <span className="text-sm text-ink-muted">{description}</span>
    </Link>
  )
}
