import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'
import { useTostiRealtime } from '../useTostiRealtime'
import { breadLabel, fillingLabel } from '../utils/tostiLabels'
import { localISODate, isPhysicalTostiOrder } from './kraam/kraamFormat'
import { KraamAvondetenSection } from './kraam/KraamAvondetenSection'
import { KraamCardSearchSection } from './kraam/KraamCardSearchSection'
import { KraamPaymentQueueSection } from './kraam/KraamPaymentQueueSection'
import { KraamPhysicalSaleSection } from './kraam/KraamPhysicalSaleSection'
import { KraamSoldTodayHeader } from './kraam/KraamSoldTodayHeader'
import { KraamTostiQueueSection } from './kraam/KraamTostiQueueSection'

export function KraamPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<api.OperatorCardRow[]>([])
  const [members, setMembers] = useState<api.OperatorMember[]>([])
  const [orders, setOrders] = useState<api.OperatorTostiOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [busyOrder, setBusyOrder] = useState<{ id: number; action: 'deliver' | 'cancel' } | null>(null)
  const [paymentRows, setPaymentRows] = useState<api.AdminRequest[]>([])
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentLoadFailed, setPaymentLoadFailed] = useState(false)
  const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null)
  const [avondetenMealDate, setAvondetenMealDate] = useState(() => localISODate())
  const [avondetenRows, setAvondetenRows] = useState<api.AvondetenRegistrationCard[]>([])
  const [avondetenLoading, setAvondetenLoading] = useState(true)
  const [avondetenPicked, setAvondetenPicked] = useState<number[]>([])
  const [avondetenSubmitting, setAvondetenSubmitting] = useState(false)
  const [soldToday, setSoldToday] = useState<api.OperatorTostiSoldToday | null>(null)
  const [soldTodayLoading, setSoldTodayLoading] = useState(true)
  const [saleUserID, setSaleUserID] = useState<number>(0)
  const [saleKind, setSaleKind] = useState<api.CardKind>('tosti')
  const [salePaymentMethod, setSalePaymentMethod] = useState<api.PaymentMethod>('tikkie')
  const [saleSubmitting, setSaleSubmitting] = useState(false)

  const loadPayments = useCallback(async () => {
    setPaymentLoading(true)
    setPaymentLoadFailed(false)
    try {
      const list = await api.getAdminRequests()
      setPaymentRows(list)
    } catch (e) {
      setPaymentRows([])
      setPaymentLoadFailed(true)
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Betalingswachtrij laden mislukt', message: msg, variant: 'error' })
    } finally {
      setPaymentLoading(false)
    }
  }, [alert])

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const list = await api.getOperatorTostiOrders()
      setOrders(list)
    } catch (e) {
      setOrders([])
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Bestelwachtrij laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoadingOrders(false)
    }
  }, [alert])

  const loadSoldToday = useCallback(async () => {
    setSoldTodayLoading(true)
    try {
      const r = await api.getOperatorTostiSoldToday()
      setSoldToday(r)
    } catch {
      setSoldToday(null)
    } finally {
      setSoldTodayLoading(false)
    }
  }, [])

  const loadAvondeten = useCallback(async () => {
    setAvondetenLoading(true)
    try {
      const r = await api.getAvondetenRegistrations(avondetenMealDate)
      setAvondetenRows(r.cards)
      setAvondetenPicked([])
    } catch (e) {
      setAvondetenRows([])
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Avondetenlijst laden mislukt', message: msg, variant: 'error' })
    } finally {
      setAvondetenLoading(false)
    }
  }, [avondetenMealDate, alert])

  useEffect(() => {
    void loadAvondeten()
  }, [loadAvondeten])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.getOperatorCards(q)
      setRows(list)
    } catch (e) {
      setRows([])
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Kaarten laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [q, alert])

  const loadMembers = useCallback(async () => {
    try {
      const list = await api.getOperatorMembers()
      setMembers(list)
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      setMembers([])
      void alert({ title: 'Leden laden mislukt', message: msg, variant: 'error' })
    }
  }, [alert])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    void loadSoldToday()
  }, [loadSoldToday])

  useEffect(() => {
    void loadPayments()
  }, [loadPayments])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300)
    return () => window.clearTimeout(t)
  }, [load])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const onKraamRealtime = useCallback(
    (reason: string) => {
      if (reason === 'open') {
        void loadOrders()
        void loadSoldToday()
        void load()
        void loadPayments()
        void loadAvondeten()
        return
      }
      if (reason === 'tosti_queue') {
        void loadOrders()
        void loadSoldToday()
        void load()
        void loadAvondeten()
        return
      }
      if (reason === 'payment_requests') {
        void loadPayments()
      }
    },
    [loadOrders, loadSoldToday, load, loadPayments, loadAvondeten],
  )

  useTostiRealtime(
    '/ws/kraam',
    Boolean(user && (user.is_admin || user.is_operator)),
    onKraamRealtime,
    ['tosti_queue', 'payment_requests'],
  )

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!user.is_admin && !user.is_operator) {
    return <Navigate to="/" replace />
  }

  async function refreshAll() {
    await Promise.all([loadOrders(), loadSoldToday(), loadPayments(), load(), loadAvondeten(), loadMembers()])
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
      await loadAvondeten()
      await load()
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
      await refreshAll()
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
      await loadPayments()
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
      await loadPayments()
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
      await load()
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
    const q = o.quantity
    const qtyPrefix = q > 1 ? `${q}× ` : ''
    const physical = isPhysicalTostiOrder(o)
    const knipjeTxt = q === 1 ? '1 knipje wordt' : `${q} knipjes worden`
    const breadShort = breadLabel(o.bread, 'short')
    const confirmMessage = physical
      ? `${o.customer_name}: ${qtyPrefix}${breadShort} brood, ${fillingLabel(o.filling)} — fysieke kaart. Knip ${q === 1 ? '1 knipje' : `${q} knipjes`} op de kaart.`
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
      await refreshAll()
      await refresh()
      await alert({
        title: 'Geleverd',
        message: physical
          ? q === 1
            ? 'Knip 1 knipje op de fysieke kaart.'
            : `Knip ${q} knipjes op de fysieke kaart.`
          : q === 1
            ? 'Het knipje is afgetrokken.'
            : `De ${q} knipjes zijn afgetrokken.`,
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
      await loadOrders()
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
        onRefreshQueue={() => void Promise.all([loadOrders(), loadSoldToday()])}
        onDeliverOrder={onDeliverOrder}
        onCancelOrder={onCancelOrder}
      />

      <KraamPaymentQueueSection
        user={user}
        paymentLoading={paymentLoading}
        paymentLoadFailed={paymentLoadFailed}
        paymentRows={paymentRows}
        paymentBusyId={paymentBusyId}
        onRefresh={loadPayments}
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
        onRefreshAll={refreshAll}
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
        onRefresh={loadAvondeten}
        onSubmit={onSubmitAvondeten}
      />
    </div>
  )
}
