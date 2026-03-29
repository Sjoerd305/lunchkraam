import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { useAlertDialog } from '../components/AlertDialogProvider'

function breadLabel(b: api.TostiBread): string {
  return b === 'bruin' ? 'Bruin' : 'Wit'
}

function fillingLabel(f: api.TostiFilling): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
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
    const t = window.setTimeout(() => void load(), 300)
    return () => window.clearTimeout(t)
  }, [load])

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!user.is_admin && !user.is_operator) {
    return <Navigate to="/" replace />
  }

  async function refreshAll() {
    await Promise.all([loadOrders(), load()])
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
      await alert({ title: 'Geregistreerd', message: 'Het knipje is afgetrokken.', variant: 'success' })
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
    const knipjeTxt = q === 1 ? '1 knipje wordt' : `${q} knipjes worden`
    const ok = await confirm({
      title: 'Als geleverd markeren?',
      message: `${o.customer_name}: ${qtyPrefix}${breadLabel(o.bread)} brood, ${fillingLabel(o.filling)} — ${knipjeTxt} afgetrokken van kaart #${o.card_id}.`,
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
        message: q === 1 ? 'Het knipje is afgetrokken.' : `De ${q} knipjes zijn afgetrokken.`,
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
      message: `Bestelling van ${o.customer_name} wordt geannuleerd (geen knipjes kwijt).`,
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

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-slate-900">Lunchkraam</h1>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tosti-bestellingen</h2>
            <p className="text-sm text-slate-600">
              Markeer als geleverd om het aantal knipjes (1 per tosti) automatisch af te boeken op de gekozen kaart.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders()}
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
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{o.customer_name}</p>
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
                    Kaart #{o.card_id} · {new Date(o.created_at).toLocaleString('nl-NL')}
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
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Kaarten & handmatig knipje</h2>
        <p className="text-slate-600">
          Zoek op <strong>kaartnummer</strong>, <strong>naam</strong> of <strong>e-mail</strong>. Je kunt hier nog
          steeds handmatig een knipje afnemen (bijv. zonder app-bestelling).
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek…"
            className="min-h-11 w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-slate-900 shadow-sm"
            aria-label="Zoek kaarten"
          />
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
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
                  <p className="font-mono text-xs text-slate-500">Kaart #{c.id}</p>
                  <p className="font-semibold text-slate-900">{c.owner_name}</p>
                  <p className="text-sm text-slate-600">{c.owner_email}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <strong>{c.knipjes_remaining}</strong> / 10 knipjes
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId !== null || c.knipjes_remaining <= 0}
                  onClick={() => void onUseKnipje(c)}
                  className="min-h-11 shrink-0 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
                >
                  {busyId === c.id ? 'Bezig…' : '1 knipje gebruiken'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
