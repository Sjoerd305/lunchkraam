import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'
import { useQueryErrorAlert } from '../hooks/useQueryErrorAlert'
import { queryKeys } from '../queryKeys'
import { useTostiRealtime } from '../useTostiRealtime'
import { breadLabel, fillingLabel } from '../utils/tostiLabels'
import { cardKindLabel, formatAmsterdamDateLong, isPhysicalTostiOrder, localISODate } from './kraam/kraamFormat'
import { KraamAvondetenSection } from './kraam/KraamAvondetenSection'
import { KraamCardSearchSection } from './kraam/KraamCardSearchSection'
import { KraamPaymentQueueSection } from './kraam/KraamPaymentQueueSection'
import { KraamPhysicalSaleSection } from './kraam/KraamPhysicalSaleSection'
import { KraamSoldTodayHeader } from './kraam/KraamSoldTodayHeader'
import { KraamTostiQueueSection } from './kraam/KraamTostiQueueSection'

/* Tabs, in volgorde van gebruik aan de kraam. `?tab=` in de URL maakt diepe links mogelijk (bijv. vanuit Beheer). */
type Tab = 'bestellingen' | 'knipje' | 'avondeten' | 'verkoop' | 'betalingen'
const TABS: readonly Tab[] = ['bestellingen', 'knipje', 'avondeten', 'verkoop', 'betalingen']

function isTab(v: string | null): v is Tab {
  return v !== null && (TABS as readonly string[]).includes(v)
}

const operatorEnabled = (user: api.User | null) => Boolean(user && (user.is_admin || user.is_operator))

export function KraamPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = isTab(tabParam) ? tabParam : 'bestellingen'
  const setTab = (t: Tab) => setSearchParams(t === 'bestellingen' ? {} : { tab: t }, { replace: true })

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [busyOrder, setBusyOrder] = useState<{ id: number; action: 'deliver' | 'cancel' } | null>(null)
  const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null)
  const [avondetenMealDate, setAvondetenMealDate] = useState(() => localISODate())
  const [avondetenPicked, setAvondetenPicked] = useState<number[]>([])
  const [avondetenSubmitting, setAvondetenSubmitting] = useState(false)
  const [saleUserID, setSaleUserID] = useState<number>(0)
  const [saleKind, setSaleKind] = useState<api.CardKind>('tosti')
  const [salePaymentMethod, setSalePaymentMethod] = useState<api.PaymentMethod>('tikkie')
  const [saleSubmitting, setSaleSubmitting] = useState(false)

  const kraamEnabled = operatorEnabled(user)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const cardsQuery = useQuery({
    queryKey: queryKeys.operator.cards(debouncedQ),
    queryFn: () => api.getOperatorCards(debouncedQ),
    enabled: kraamEnabled,
  })
  const membersQuery = useQuery({
    queryKey: queryKeys.operator.members,
    queryFn: () => api.getOperatorMembers(),
    enabled: kraamEnabled,
  })
  const ordersQuery = useQuery({
    queryKey: queryKeys.operator.tostiOrders,
    queryFn: () => api.getOperatorTostiOrders(),
    enabled: kraamEnabled,
  })
  const soldTodayQuery = useQuery({
    queryKey: queryKeys.operator.soldToday,
    queryFn: () => api.getOperatorTostiSoldToday(),
    enabled: kraamEnabled,
    retry: false,
  })
  const paymentsQuery = useQuery({
    queryKey: queryKeys.admin.requests,
    queryFn: () => api.getAdminRequests(),
    enabled: kraamEnabled,
  })
  const avondetenQuery = useQuery({
    queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate),
    queryFn: () => api.getAvondetenRegistrations(avondetenMealDate),
    enabled: kraamEnabled,
  })

  useQueryErrorAlert(cardsQuery, { title: 'Kaarten laden mislukt', alert })
  useQueryErrorAlert(ordersQuery, { title: 'Bestelwachtrij laden mislukt', alert })
  useQueryErrorAlert(paymentsQuery, { title: 'Betalingswachtrij laden mislukt', alert })
  useQueryErrorAlert(avondetenQuery, { title: 'Avondetenlijst laden mislukt', alert })
  useQueryErrorAlert(membersQuery, { title: 'Leden laden mislukt', alert })

  const rows = cardsQuery.data ?? []
  const members = membersQuery.data ?? []
  const orders = ordersQuery.data ?? []
  const paymentRows = paymentsQuery.data ?? []
  const soldToday = soldTodayQuery.isError ? null : (soldTodayQuery.data ?? null)
  const avondetenRows = avondetenQuery.data?.cards ?? []

  useEffect(() => {
    if (avondetenQuery.isSuccess) setAvondetenPicked([])
  }, [avondetenQuery.dataUpdatedAt, avondetenMealDate, avondetenQuery.isSuccess])

  const invalidateKraamAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operator'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests }),
    ])
  }, [queryClient])

  const invalidateCardsAndBalances = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operator', 'cards'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate) }),
      queryClient.invalidateQueries({ queryKey: ['member', 'card-transactions'] }),
      refresh(),
    ])
  }, [queryClient, avondetenMealDate, refresh])

  const onKraamRealtime = useCallback(
    (reason: string) => {
      if (reason === 'open') {
        void invalidateKraamAll()
        return
      }
      if (reason === 'tosti_queue') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.operator.tostiOrders })
        void queryClient.invalidateQueries({ queryKey: queryKeys.operator.soldToday })
        void queryClient.invalidateQueries({ queryKey: ['operator', 'cards'] })
        void queryClient.invalidateQueries({ queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate) })
        void queryClient.invalidateQueries({ queryKey: ['member', 'card-transactions'] })
        return
      }
      if (reason === 'payment_requests') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      }
    },
    [queryClient, invalidateKraamAll, avondetenMealDate],
  )

  useTostiRealtime('/ws/kraam', kraamEnabled, onKraamRealtime, ['tosti_queue', 'payment_requests'])

  const refreshQueue = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operator.tostiOrders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.operator.soldToday }),
    ])
  }, [queryClient])

  const refreshPayments = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
  }, [queryClient])

  const refreshAvondeten = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate) })
  }, [queryClient, avondetenMealDate])

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!user.is_admin && !user.is_operator) {
    return <Navigate to="/" replace />
  }

  function toggleAvondetenPick(cardId: number) {
    setAvondetenPicked((prev) => {
      const s = new Set(prev)
      if (s.has(cardId)) s.delete(cardId)
      else s.add(cardId)
      return Array.from(s)
    })
  }

  async function onSubmitAvondeten() {
    if (avondetenPicked.length === 0) {
      void alert({ title: 'Geen selectie', message: 'Vink minstens één lid aan.', variant: 'error' })
      return
    }
    const ok = await confirm({
      title: 'Avondeten registreren?',
      message: `Voor ${formatAmsterdamDateLong(avondetenMealDate)}: ${avondetenPicked.length} knipje(s) afboeken op de geselecteerde kaarten?`,
      confirmLabel: 'Ja, afboeken',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setAvondetenSubmitting(true)
    try {
      const n = await api.postAvondetenRegister(csrf, avondetenMealDate, avondetenPicked)
      await invalidateCardsAndBalances()
      await alert({
        title: 'Opgeslagen',
        message: n === 1 ? '1 knipje is afgeboekt.' : `${n} knipjes zijn afgeboekt.`,
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setAvondetenSubmitting(false)
    }
  }

  const memberOptions = members
    .map((m) => ({ user_id: m.id, label: `${m.name} (${m.email})` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL'))

  async function onRegisterPhysicalSale() {
    if (saleUserID <= 0) {
      void alert({ title: 'Geen lid gekozen', message: 'Kies eerst een lid voor de kaartverkoop.', variant: 'error' })
      return
    }
    const selectedMember = memberOptions.find((m) => m.user_id === saleUserID)
    const kindLabel = saleKind === 'avondeten' ? 'avondetenkaart' : 'tostikaart'
    const paymentLabel = salePaymentMethod === 'contant' ? 'contant' : 'Tikkie'
    const ok = await confirm({
      title: 'Fysieke kaartverkoop registreren?',
      message: `${selectedMember?.label ?? `Gebruiker #${saleUserID}`}: ${kindLabel}, betaald via ${paymentLabel}. De verkoop telt direct als geaccordeerd.`,
      confirmLabel: 'Ja, registreren',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setSaleSubmitting(true)
    try {
      const requestID = await api.createOperatorCardSale(csrf, {
        user_id: saleUserID,
        kind: saleKind,
        payment_method: salePaymentMethod,
      })
      setSaleUserID(0)
      await invalidateKraamAll()
      await refresh()
      await alert({
        title: 'Verkoop geregistreerd',
        message: `Kaartverkoop opgeslagen (verkoop #${requestID}).`,
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Registreren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSaleSubmitting(false)
    }
  }

  async function onPaymentFulfill(id: number, knipjesRemaining: number) {
    const ok = await confirm({
      title: 'Betaling accorderen?',
      message: `Accorderen? Op de kaart staan nog ${knipjesRemaining} knipje(s).`,
      confirmLabel: 'Accorderen',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setPaymentBusyId(id)
    try {
      await api.fulfillRequest(csrf, id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      await refresh()
      await alert({ title: 'Geaccordeerd', message: 'De aanvraag is uit de wachtrij gehaald.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Toekennen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setPaymentBusyId(null)
    }
  }

  async function onPaymentReject(id: number) {
    const ok = await confirm({
      title: 'Aanvraag weigeren?',
      message: 'De voorlopige kaart wordt verwijderd.',
      confirmLabel: 'Ja, weigeren',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setPaymentBusyId(id)
    try {
      await api.rejectAdminRequest(csrf, id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      await refresh()
      await alert({ title: 'Afgewezen', message: 'De aanvraag is geannuleerd.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Weigeren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setPaymentBusyId(null)
    }
  }

  async function onUseKnipje(c: api.OperatorCardRow) {
    if (c.knipjes_remaining <= 0) return
    const ok = await confirm({
      title: 'Knipje afboeken?',
      message: `1 knipje afboeken voor ${c.owner_name} (kaart #${c.id}, ${cardKindLabel(c.kind).toLowerCase()})?`,
      confirmLabel: 'Ja, afboeken',
      cancelLabel: 'Annuleren',
      tone: 'brand',
    })
    if (!ok) return
    setBusyId(c.id)
    try {
      await api.useKnipje(csrf, c.id)
      await invalidateCardsAndBalances()
      await alert({
        title: 'Afgeboekt',
        message: 'Het knipje staat in de historie en kan daar worden teruggedraaid.',
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Kon geen knipje afboeken', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function onSetEstimate(c: api.OperatorCardRow, value: number) {
    try {
      await api.setCardEstimate(csrf, c.id, value)
      await invalidateCardsAndBalances()
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Schatting niet opgeslagen', message: msg, variant: 'error' })
      throw e
    }
  }

  async function onDeliverOrder(o: api.OperatorTostiOrderRow) {
    const qty = o.quantity
    const qtyPrefix = qty > 1 ? `${qty}× ` : ''
    const physical = isPhysicalTostiOrder(o)
    const knipjes = qty === 1 ? '1 knipje' : `${qty} knipjes`
    const breadShort = breadLabel(o.bread, 'short')
    const confirmMessage = physical
      ? `${o.customer_name}: ${qtyPrefix}${breadShort} brood, ${fillingLabel(o.filling)}. Fysieke kaart: knip ${knipjes} op de kaart.`
      : `${o.customer_name}: ${qtyPrefix}${breadShort} brood, ${fillingLabel(o.filling)}. ${knipjes} wordt afgeboekt van kaart #${o.card_id}.`
    const ok = await confirm({
      title: 'Als geleverd markeren?',
      message: confirmMessage,
      confirmLabel: 'Ja, geleverd',
      cancelLabel: 'Annuleren',
      tone: 'brand',
    })
    if (!ok) return
    setBusyOrder({ id: o.id, action: 'deliver' })
    try {
      await api.deliverOperatorTostiOrder(csrf, o.id)
      await invalidateKraamAll()
      await refresh()
      if (physical) {
        await alert({ title: 'Geleverd', message: `Knip ${knipjes} op de fysieke kaart.`, variant: 'success' })
      }
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Leveren mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyOrder(null)
    }
  }

  async function onCancelOrder(o: api.OperatorTostiOrderRow) {
    const ok = await confirm({
      title: 'Bestelling annuleren?',
      message: `Bestelling van ${o.customer_name} annuleren?`,
      confirmLabel: 'Annuleren',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setBusyOrder({ id: o.id, action: 'cancel' })
    try {
      await api.cancelOperatorTostiOrder(csrf, o.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.operator.tostiOrders })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Annuleren mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyOrder(null)
    }
  }

  const avondetenSelectable = avondetenRows.filter((r) => !r.registered_for_date && r.knipjes_remaining > 0)
  const avondetenPickableIds = new Set(avondetenSelectable.map((r) => r.card_id))

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'bestellingen', label: 'Bestellingen', badge: orders.length },
    { id: 'knipje', label: 'Knipje' },
    { id: 'avondeten', label: 'Avondeten' },
    { id: 'verkoop', label: 'Verkoop' },
    { id: 'betalingen', label: 'Betalingen', badge: paymentRows.length },
  ]

  return (
    <div className="space-y-6">
      <KraamSoldTodayHeader
        soldTodayLoading={soldTodayQuery.isFetching}
        soldToday={soldToday}
        onRefreshAll={() => void invalidateKraamAll()}
      />

      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Kraam-onderdelen">
        <div className="flex min-w-max gap-1 border-b border-line">
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px flex min-h-12 items-center gap-2 border-b-[3px] px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  active ? 'border-accent-400 text-brand-900' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
                {t.badge ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      active ? 'bg-brand-900 text-white' : 'bg-accent-100 text-accent-800'
                    }`}
                  >
                    {t.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      {tab === 'bestellingen' ? (
        <KraamTostiQueueSection
          loadingOrders={ordersQuery.isFetching}
          orders={orders}
          busyOrder={busyOrder}
          onRefreshQueue={() => void refreshQueue()}
          onDeliverOrder={onDeliverOrder}
          onCancelOrder={onCancelOrder}
        />
      ) : null}

      {tab === 'knipje' ? (
        <KraamCardSearchSection
          q={q}
          onQueryChange={setQ}
          loading={cardsQuery.isFetching}
          rows={rows}
          busyId={busyId}
          onUseKnipje={onUseKnipje}
          onSetEstimate={onSetEstimate}
          onHistoryChanged={invalidateCardsAndBalances}
        />
      ) : null}

      {tab === 'avondeten' ? (
        <KraamAvondetenSection
          avondetenMealDate={avondetenMealDate}
          onMealDateChange={setAvondetenMealDate}
          avondetenLoading={avondetenQuery.isFetching}
          avondetenRows={avondetenRows}
          avondetenPicked={avondetenPicked}
          avondetenPickableIds={avondetenPickableIds}
          avondetenSubmitting={avondetenSubmitting}
          onTogglePick={toggleAvondetenPick}
          onRefresh={() => void refreshAvondeten()}
          onSubmit={onSubmitAvondeten}
        />
      ) : null}

      {tab === 'verkoop' ? (
        <KraamPhysicalSaleSection
          memberOptions={memberOptions}
          saleUserID={saleUserID}
          saleKind={saleKind}
          salePaymentMethod={salePaymentMethod}
          saleSubmitting={saleSubmitting}
          onChangeUser={setSaleUserID}
          onChangeKind={setSaleKind}
          onChangePaymentMethod={setSalePaymentMethod}
          onSubmit={onRegisterPhysicalSale}
        />
      ) : null}

      {tab === 'betalingen' ? (
        <KraamPaymentQueueSection
          user={user}
          paymentLoading={paymentsQuery.isFetching}
          paymentLoadFailed={paymentsQuery.isError}
          paymentRows={paymentRows}
          paymentBusyId={paymentBusyId}
          onRefresh={() => void refreshPayments()}
          onFulfill={onPaymentFulfill}
          onReject={onPaymentReject}
        />
      ) : null}
    </div>
  )
}
