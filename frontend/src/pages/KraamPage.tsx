import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { PaymentRequestsPanel } from '../components/PaymentRequestsPanel'
import { useAlertDialog } from '../components/AlertDialogProvider'
import { useTostiRealtime } from '../useTostiRealtime'

function breadLabel(b: api.TostiBread): string {
  return b === 'bruin' ? 'Bruin' : 'Wit'
}

function fillingLabel(f: api.TostiFilling): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}

function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isPhysicalTostiOrder(o: api.OperatorTostiOrderRow): boolean {
  return o.card_id === null
}

function formatAmsterdamDateLong(yyyyMMdd: string): string {
  const p = yyyyMMdd.split('-').map(Number)
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return yyyyMMdd
  const [y, m, d] = p
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function KraamPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<api.OperatorCardRow[]>([])
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
    await Promise.all([loadOrders(), loadSoldToday(), loadPayments(), load(), loadAvondeten()])
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
      message: `1 knipje voor ${c.owner_name} (kaart #${c.id})?`,
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
    const confirmMessage = physical
      ? `${o.customer_name}: ${qtyPrefix}${breadLabel(o.bread)} brood, ${fillingLabel(o.filling)} — fysieke kaart. Knip ${q === 1 ? '1 knipje' : `${q} knipjes`} op de kaart.`
      : `${o.customer_name}: ${qtyPrefix}${breadLabel(o.bread)} brood, ${fillingLabel(o.filling)} — ${knipjeTxt} afgetrokken van kaart #${o.card_id}.`
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
        <h1 className="text-2xl font-bold text-slate-900 lg:shrink-0">Lunchkraam</h1>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:max-w-md lg:shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verkocht vandaag</p>
          {soldTodayLoading ? (
            <p className="mt-2 text-sm text-slate-600">Laden…</p>
          ) : soldToday ? (
            <>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{soldToday.quantity}</p>
              <p className="mt-1 text-sm text-slate-700">
                {soldToday.quantity === 1 ? 'tosti geleverd' : 'tosti’s geleverd'}
              </p>
              <p className="mt-2 text-xs text-slate-500">{formatAmsterdamDateLong(soldToday.amsterdam_date)}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-800">Kon het totaal niet laden. Vernieuw de pagina.</p>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tosti-bestellingen</h2>
            <p className="text-sm text-slate-600">
              Bij een digitale kaart worden knipjes bij leveren afgeboekt. Bij een fysieke kaart knipjes knippen op de
              kaart.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void Promise.all([loadOrders(), loadSoldToday()])}
            className="min-h-10 shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Wachtrij vernieuwen
          </button>
        </div>
        {loadingOrders && orders.length === 0 ? (
          <p className="text-slate-600">Bestellingen laden…</p>
        ) : orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
            Geen openstaande tostibestellingen.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const physical = isPhysicalTostiOrder(o)
              return (
              <li
                key={o.id}
                className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-md sm:flex-row sm:items-center sm:justify-between ${
                  physical
                    ? 'border-amber-300/90 bg-amber-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {o.customer_name}
                    {physical ? (
                      <span className="rounded-md bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
                        Fysieke kaart
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-600">{o.customer_email}</p>
                  <p className="mt-1 text-slate-800">
                    <strong>
                      {o.quantity > 1 ? `${o.quantity}× ` : ''}
                      {breadLabel(o.bread)} brood, {fillingLabel(o.filling)}
                    </strong>
                    {o.quantity > 1 ? (
                      <span className="ml-2 text-sm font-normal text-slate-600">
                        ({o.quantity} knipjes)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {physical
                      ? new Date(o.created_at).toLocaleString('nl-NL')
                      : `Kaart #${o.card_id} · ${new Date(o.created_at).toLocaleString('nl-NL')}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyOrder !== null}
                    onClick={() => void onDeliverOrder(o)}
                    className="min-h-10 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
                  >
                    {busyOrder?.id === o.id && busyOrder.action === 'deliver' ? 'Bezig…' : 'Geleverd'}
                  </button>
                  <button
                    type="button"
                    disabled={busyOrder !== null}
                    onClick={() => void onCancelOrder(o)}
                    className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyOrder?.id === o.id && busyOrder.action === 'cancel' ? 'Bezig…' : 'Annuleren'}
                  </button>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-amber-200/90 bg-amber-50/40 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-amber-950">Betalingen in de wachtrij</h2>
            <p className="text-sm text-amber-900/85">
              Accordeer als betaald. Weigeren kan alleen zolang er nog geen knipje is gebruikt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPayments()}
            className="min-h-10 shrink-0 rounded-xl border border-amber-300/80 bg-white px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100/60"
          >
            Vernieuwen
          </button>
        </div>
        {paymentLoading && paymentRows.length === 0 ? (
          <p className="text-amber-900/80">Betalingsaanvragen laden…</p>
        ) : paymentLoadFailed && paymentRows.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-white/90 p-4 text-center">
            <p className="text-sm text-amber-950">Kon de wachtrij niet laden.</p>
            <button
              type="button"
              onClick={() => void loadPayments()}
              className="mt-3 rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900"
            >
              Opnieuw proberen
            </button>
          </div>
        ) : (
          <PaymentRequestsPanel
            rows={paymentRows}
            busyId={paymentBusyId}
            canManageRequest={(row) => Boolean(user.is_admin || row.kind !== 'avondeten')}
            onFulfill={(id, k) => void onPaymentFulfill(id, k)}
            onReject={(id) => void onPaymentReject(id)}
            layout="cards-only"
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Kaarten & handmatig knipje</h2>
        <p className="text-slate-600">Zoek op kaartnummer, naam of e-mail. Alleen tostikaarten: handmatig knipje.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek…"
            className="input-control min-h-11 max-w-md rounded-xl"
            aria-label="Zoek kaarten"
          />
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="btn-secondary min-h-11 rounded-xl px-4"
          >
            Alles vernieuwen
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-slate-600">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            Geen kaarten gevonden. Probeer een ander zoekwoord of laat leeg voor de nieuwste kaarten.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-xs text-slate-500">
                    Kaart #{c.id}{' '}
                    <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-800">
                      {c.kind === 'avondeten' ? 'Avondeten' : 'Tosti'}
                    </span>
                  </p>
                  <p className="font-semibold text-slate-900">{c.owner_name}</p>
                  <p className="text-sm text-slate-600">{c.owner_email}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <strong>{c.knipjes_remaining}</strong> / 10 knipjes
                  </p>
                </div>
                {c.kind === 'avondeten' ? (
                  <span className="text-sm text-slate-400">—</span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null || c.knipjes_remaining <= 0}
                    onClick={() => void onUseKnipje(c)}
                    className="min-h-11 shrink-0 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
                  >
                    {busyId === c.id ? 'Bezig…' : '1 knipje gebruiken'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-emerald-200/90 bg-emerald-50/50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
            <h2 className="text-lg font-semibold text-emerald-950">Avondeten</h2>
            <label className="flex max-w-[11rem] flex-col gap-1 text-sm">
              <span className="font-medium text-emerald-950">Datum</span>
              <input
                type="date"
                value={avondetenMealDate}
                onChange={(e) => setAvondetenMealDate(e.target.value)}
                className="input-control min-h-11 rounded-xl"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void loadAvondeten()}
            className="min-h-10 shrink-0 rounded-xl border border-emerald-300/80 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-100/50"
          >
            Vernieuwen
          </button>
        </div>
        {avondetenLoading ? (
          <p className="text-sm text-emerald-900/80">Laden…</p>
        ) : avondetenRows.length === 0 ? (
          <p className="text-sm text-emerald-900/80">Geen avondetenkaarten.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white shadow-sm">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-emerald-100 bg-emerald-50/80 text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
                  <tr>
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3 py-2.5">Naam</th>
                    <th className="px-3 py-2.5">Kaart</th>
                    <th className="px-3 py-2.5">Knipjes</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {avondetenRows.map((r) => {
                    const canPick = avondetenPickableIds.has(r.card_id)
                    const checked = avondetenPicked.includes(r.card_id)
                    return (
                      <tr key={r.card_id} className={r.registered_for_date ? 'bg-slate-50/80' : ''}>
                        <td className="px-3 py-2.5">
                          {canPick ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                              checked={checked}
                              onChange={() => toggleAvondetenPick(r.card_id)}
                              aria-label={`Mee-eten ${r.owner_name}`}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{r.owner_name}</div>
                          <div className="text-xs text-slate-500">{r.owner_email}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">#{r.card_id}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.knipjes_remaining} / 10</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r.registered_for_date ? (
                            <span className="text-emerald-800">Geregistreerd</span>
                          ) : r.knipjes_remaining <= 0 ? (
                            <span className="text-slate-500">Op</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
              <span className="text-sm text-emerald-900/85 sm:mr-auto">
                Geselecteerd: <strong>{avondetenPicked.length}</strong>
              </span>
              <button
                type="button"
                disabled={avondetenSubmitting || avondetenPicked.length === 0}
                onClick={() => void onSubmitAvondeten()}
                className="min-h-11 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
              >
                {avondetenSubmitting ? 'Bezig…' : 'Afboeken'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
