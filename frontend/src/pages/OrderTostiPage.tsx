import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { useAlertDialog } from '../components/AlertDialogProvider'
import { useTostiRealtime } from '../useTostiRealtime'

function breadLabel(b: api.TostiBread): string {
  return b === 'bruin' ? 'Bruin brood' : 'Wit brood'
}

function fillingLabel(f: api.TostiFilling): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}

function pendingReservedOnCard(orders: api.TostiOrder[], cardId: number): number {
  return orders
    .filter((o) => o.status === 'pending' && o.card_id === cardId)
    .reduce((sum, o) => sum + o.quantity, 0)
}

function freeKnipjesForCard(card: api.Card, orders: api.TostiOrder[]): number {
  return Math.max(0, card.knipjes_remaining - pendingReservedOnCard(orders, card.id))
}

export function OrderTostiPage() {
  const { csrf, refresh, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [cards, setCards] = useState<api.Card[]>([])
  const [orders, setOrders] = useState<api.TostiOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cardId, setCardId] = useState<number | ''>('')
  const [quantity, setQuantity] = useState(1)
  const [bread, setBread] = useState<api.TostiBread>('wit')
  const [filling, setFilling] = useState<api.TostiFilling>('ham')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cList, oList] = await Promise.all([api.getCards(), api.getMyTostiOrders()])
      setCards(cList)
      setOrders(oList)
      const usable = cList.filter((c) => freeKnipjesForCard(c, oList) > 0)
      setCardId((prev) => {
        if (prev !== '' && usable.some((c) => c.id === prev)) return prev
        return usable[0]?.id ?? ''
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

  const onMineRealtime = useCallback(
    (reason: string) => {
      if (reason === 'open' || reason === 'my_tosti_orders') {
        void load()
        void refresh()
      }
    },
    [load, refresh],
  )

  useTostiRealtime('/ws/mijn-tosti', !!user, onMineRealtime, ['my_tosti_orders'])

  const usableCards = useMemo(
    () => cards.filter((c) => freeKnipjesForCard(c, orders) > 0),
    [cards, orders],
  )
  const selectedCard = useMemo(
    () => (cardId !== '' ? cards.find((c) => c.id === cardId) : undefined),
    [cards, cardId],
  )
  const freeOnCard = selectedCard ? freeKnipjesForCard(selectedCard, orders) : 0
  const maxQuantity = Math.min(10, Math.max(0, freeOnCard))

  useEffect(() => {
    if (maxQuantity <= 0) return
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity))
  }, [maxQuantity, cardId])

  const pendingOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'pending')
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (cardId === '' || typeof cardId !== 'number') {
      void alert({
        title: 'Geen kaart',
        message: 'Je hebt geen kaart met vrije knipjes voor een nieuwe bestelling.',
        variant: 'error',
      })
      return
    }
    if (maxQuantity < 1 || quantity < 1 || quantity > maxQuantity) {
      void alert({
        title: 'Aantal',
        message:
          maxQuantity < 1
            ? 'Op deze kaart zijn geen knipjes meer vrij (alles zit in openstaande bestellingen).'
            : `Kies een aantal tussen 1 en ${maxQuantity}.`,
        variant: 'error',
      })
      return
    }
    setSubmitting(true)
    try {
      await api.createTostiOrder(csrf, { card_id: cardId, bread, filling, quantity })
      await load()
      await refresh()
      const knipWord = quantity === 1 ? 'knipje' : 'knipjes'
      await alert({
        title: 'Bestelling geplaatst',
        message: `De matroos ziet je bestelling in de kraam-app. Er ${quantity === 1 ? 'wordt 1' : `worden ${quantity}`} ${knipWord} afgetrokken zodra hij geleverd is.`,
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Bestellen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onCancelPending(orderId: number) {
    const ok = await confirm({
      title: 'Bestelling annuleren?',
      message: 'Deze openstaande bestelling wordt geannuleerd (je verliest geen knipjes).',
      confirmLabel: 'Ja, annuleren',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    try {
      await api.cancelMyTostiOrder(csrf, orderId)
      await load()
      await refresh()
      await alert({ title: 'Geannuleerd', message: 'De bestelling is geannuleerd.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Annuleren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  if (loading && cards.length === 0 && orders.length === 0) {
    return <p className="text-slate-600">Laden…</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tosti bestellen</h1>
        <p className="mt-2 text-slate-600">
          Elke tosti = 1 knipje. Je mag meerdere bestellingen tegelijk open hebben, zolang het totaal niet meer is
          dan je <strong>vrije</strong> knipjes per kaart (saldo min openstaande bestellingen op die kaart). Knipjes
          worden pas afgeboekt als de matroos <strong>geleverd</strong> markeert.
        </p>
      </div>

      {pendingOrders.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-950">Openstaande bestellingen</h2>
          <ul className="mt-4 space-y-4">
            {pendingOrders.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 border-b border-amber-200/80 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-amber-950">
                    {p.quantity > 1 ? `${p.quantity}× ` : ''}
                    {breadLabel(p.bread)}, {fillingLabel(p.filling)} — kaart #{p.card_id}
                  </p>
                  <p className="text-sm text-amber-800/90">
                    Geplaatst {new Date(p.created_at).toLocaleString('nl-NL')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onCancelPending(p.id)}
                  className="shrink-0 rounded-xl border border-amber-700/40 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100/80"
                >
                  Annuleren
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Nieuwe bestelling</h2>
        {usableCards.length === 0 ? (
          <p className="mt-4 text-slate-600">
            Je hebt geen vrije knipjes om te bestellen (alle knipjes zitten in openstaande bestellingen, of je hebt
            geen saldo). Ga naar <strong>Kaart kopen</strong> of <strong>Mijn kaarten</strong>, of annuleer een
            openstaande bestelling.
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-5">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Kaart (knipjes)</span>
              <select
                value={cardId === '' ? '' : String(cardId)}
                onChange={(e) => setCardId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2"
                required
              >
                {usableCards.map((c) => {
                  const free = freeKnipjesForCard(c, orders)
                  return (
                    <option key={c.id} value={c.id}>
                      Kaart #{c.id} — {c.knipjes_remaining} knipjes ({free} vrij)
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Aantal tosti&apos;s</span>
              <input
                type="number"
                min={maxQuantity > 0 ? 1 : 0}
                max={maxQuantity > 0 ? maxQuantity : 0}
                value={quantity}
                disabled={maxQuantity < 1}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n)) return
                  setQuantity(Math.min(Math.max(1, Math.trunc(n)), Math.max(1, maxQuantity)))
                }}
                className="mt-1 w-full max-w-[8rem] rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {maxQuantity < 1
                  ? 'Geen vrije knipjes op deze kaart.'
                  : `Maximaal ${maxQuantity} (vrije knipjes op deze kaart).`}
              </span>
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Brood</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {(['wit', 'bruin'] as const).map((b) => (
                  <label key={b} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="bread"
                      value={b}
                      checked={bread === b}
                      onChange={() => setBread(b)}
                    />
                    {breadLabel(b)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Vulling</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {(
                  [
                    ['ham', 'Ham'],
                    ['kaas', 'Kaas'],
                    ['ham_kaas', 'Ham & kaas'],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="filling"
                      value={v}
                      checked={filling === v}
                      onChange={() => setFilling(v)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={submitting || maxQuantity < 1 || usableCards.length === 0}
              className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {submitting ? 'Bezig…' : 'Bestelling plaatsen'}
            </button>
          </form>
        )}
      </section>

      {orders.some((o) => o.status !== 'pending') ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            {orders
              .filter((o) => o.status !== 'pending')
              .slice(0, 15)
              .map((o) => (
                <li key={o.id} className="rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
                  <span className="font-medium text-slate-800">
                    {o.quantity > 1 ? `${o.quantity}× ` : ''}
                    {breadLabel(o.bread)}, {fillingLabel(o.filling)}
                  </span>
                  {' — '}
                  {o.status === 'delivered' ? (
                    <span className="text-green-700">geleverd</span>
                  ) : (
                    <span className="text-slate-500">geannuleerd</span>
                  )}
                  <span className="text-slate-400"> · {new Date(o.created_at).toLocaleString('nl-NL')}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
