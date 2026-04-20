import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'
import { useQueryErrorAlert } from '../hooks/useQueryErrorAlert'
import { queryKeys } from '../queryKeys'
import { useTostiRealtime } from '../useTostiRealtime'
import { breadLabel, fillingLabel } from '../utils/tostiLabels'
import { localISODate, isPhysicalTostiOrder } from './kraam/kraamFormat'
import { KraamAvondetenSection } from './kraam/KraamAvondetenSection'
import { KraamCardSearchSection } from './kraam/KraamCardSearchSection'
import { KraamPaymentQueueSection } from './kraam/KraamPaymentQueueSection'
import { KraamPhysicalSaleSection } from './kraam/KraamPhysicalSaleSection'
import { KraamSoldTodayHeader } from './kraam/KraamSoldTodayHeader'
import { KraamTostiQueueSection } from './kraam/KraamTostiQueueSection'

const operatorEnabled = (user: api.User | null) =>
  Boolean(user && (user.is_admin || user.is_operator))

export function KraamPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
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

  const loading = cardsQuery.isFetching
  const loadingOrders = ordersQuery.isFetching
  const paymentLoading = paymentsQuery.isFetching
  const paymentLoadFailed = paymentsQuery.isError
  const avondetenLoading = avondetenQuery.isFetching
  const soldTodayLoading = soldTodayQuery.isFetching

  useEffect(() => {
    if (avondetenQuery.isSuccess) setAvondetenPicked([])
  }, [avondetenQuery.dataUpdatedAt, avondetenMealDate, avondetenQuery.isSuccess])

  const invalidateKraamAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operator'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests }),
    ])
  }, [queryClient])

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
        void queryClient.invalidateQueries({
          queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate),
        })
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
    await queryClient.invalidateQueries({
      queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate),
    })
  }, [queryClient, avondetenMealDate])

  const refreshCardSearch = useCallback(async () => {
    await invalidateKraamAll()
  }, [invalidateKraamAll])

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
      message: `Voor ${avondetenMealDate}: ${avondetenPicked.length} knipje(s) afboeken op de geselecteerde kaarten?`,
      confirmLabel: 'Ja, opslaan',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setAvondetenSubmitting(true)
    try {
      const n = await api.postAvondetenRegister(csrf, avondetenMealDate, avondetenPicked)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.operator.avondetenRegistrations(avondetenMealDate),
      })
      await queryClient.invalidateQueries({ queryKey: ['operator', 'cards'] })
      await refresh()
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
    .map((m) => ({
      user_id: m.id,
      label: `${m.name} (${m.email})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL'))

  async function onRegisterPhysicalSale() {
    if (saleUserID <= 0) {
      void alert({ title: 'Geen lid gekozen', message: 'Kies eerst een lid voor de kaartverkoop.', variant: 'error' })
      return
    }
    const selectedMember = memberOptions.find((m) => m.user_id === saleUserID)
    const kindLabel = saleKind === 'avondeten' ? 'avondetenkaart' : 'tostikaart'
    const paymentLabel = salePaymentMethod === 'contant' ? 'contant' : 'tikkie'
    const ok = await confirm({
      title: 'Fysieke kaartverkoop registreren?',
      message: `${selectedMember?.label ?? `Gebruiker #${saleUserID}`}: ${kindLabel} betaald via ${paymentLabel}.`,
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
      await invalidateKraamAll()
      await refresh()
      await alert({
        title: 'Verkoop geregistreerd',
        message: `Kaartverkoop opgeslagen (aanvraag #${requestID}).`,
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
    const msg =
      knipjesRemaining === 10
        ? 'Accorderen? Op de kaart staan nog 10 knipjes.'
        : `Accorderen? Op de kaart staan nog ${knipjesRemaining} knipje(s).`
    const ok = await confirm({
      title: 'Betaling accorderen?',
      message: msg,
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
      await alert({
        title: 'Geaccordeerd',
        message: 'De aanvraag is uit de wachtrij gehaald.',
        variant: 'success',
      })
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
      title: 'Knipje afnemen?',
      message: `1 knipje afboeken voor ${c.owner_name} (kaart #${c.id})?`,
      confirmLabel: 'Ja, knipje gebruiken',
      cancelLabel: 'Annuleren',
      tone: 'brand',
    })
    if (!ok) return
    setBusyId(c.id)
    try {
      await api.useKnipje(csrf, c.id)
      await queryClient.invalidateQueries({ queryKey: ['operator', 'cards'] })
      await refresh()
      await alert({
        title: 'Geregistreerd',
        message: 'Het knipje is afgetrokken.',
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Kon geen knipje gebruiken', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function onDeliverOrder(o: api.OperatorTostiOrderRow) {
    const qty = o.quantity
    const qtyPrefix = qty > 1 ? `${qty}× ` : ''
    const physical = isPhysicalTostiOrder(o)
    const knipjeTxt = qty === 1 ? '1 knipje wordt' : `${qty} knipjes worden`
    const breadShort = breadLabel(o.bread, 'short')
    const confirmMessage = physical
      ? `${o.customer_name}: ${qtyPrefix}${breadShort} brood, ${fillingLabel(o.filling)} — fysieke kaart. Knip ${qty === 1 ? '1 knipje' : `${qty} knipjes`} op de kaart.`
      : `${o.customer_name}: ${qtyPrefix}${breadShort} brood, ${fillingLabel(o.filling)} — ${knipjeTxt} afgetrokken van kaart #${o.card_id}.`
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
      await alert({
        title: 'Geleverd',
        message: physical
          ? qty === 1
            ? 'Knip 1 knipje op de fysieke kaart.'
            : `Knip ${qty} knipjes op de fysieke kaart.`
          : qty === 1
            ? 'Het knipje is afgetrokken.'
            : `De ${qty} knipjes zijn afgetrokken.`,
        variant: 'success',
      })
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
      await alert({ title: 'Geannuleerd', message: 'De bestelling is geannuleerd.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Annuleren mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyOrder(null)
    }
  }

  const avondetenSelectable = avondetenRows.filter((r) => !r.registered_for_date && r.knipjes_remaining > 0)
  const avondetenPickableIds = new Set(avondetenSelectable.map((r) => r.card_id))

  return (
    <div className="space-y-10">
      <KraamSoldTodayHeader soldTodayLoading={soldTodayLoading} soldToday={soldToday} />

      <KraamTostiQueueSection
        loadingOrders={loadingOrders}
        orders={orders}
        busyOrder={busyOrder}
        onRefreshQueue={() => void refreshQueue()}
        onDeliverOrder={onDeliverOrder}
        onCancelOrder={onCancelOrder}
      />

      <KraamPaymentQueueSection
        user={user}
        paymentLoading={paymentLoading}
        paymentLoadFailed={paymentLoadFailed}
        paymentRows={paymentRows}
        paymentBusyId={paymentBusyId}
        onRefresh={() => void refreshPayments()}
        onFulfill={onPaymentFulfill}
        onReject={onPaymentReject}
      />

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

      <KraamCardSearchSection
        q={q}
        onQueryChange={setQ}
        loading={loading}
        rows={rows}
        busyId={busyId}
        onRefreshAll={() => void refreshCardSearch()}
        onUseKnipje={onUseKnipje}
      />

      <KraamAvondetenSection
        avondetenMealDate={avondetenMealDate}
        onMealDateChange={setAvondetenMealDate}
        avondetenLoading={avondetenLoading}
        avondetenRows={avondetenRows}
        avondetenPicked={avondetenPicked}
        avondetenPickableIds={avondetenPickableIds}
        avondetenSubmitting={avondetenSubmitting}
        onTogglePick={toggleAvondetenPick}
        onRefresh={() => void refreshAvondeten()}
        onSubmit={onSubmitAvondeten}
      />
    </div>
  )
}
