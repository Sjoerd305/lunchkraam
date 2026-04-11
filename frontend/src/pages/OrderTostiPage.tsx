import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'
import { useTostiRealtime } from '../useTostiRealtime'

function breadLabel(b: api.TostiBread): string {
  return b === 'bruin' ? 'Bruin brood' : 'Wit brood'
}

function fillingLabel(f: api.TostiFilling): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}

const tostiRemarkMaxChars = 500

function unicodeScalarCount(s: string): number {
  return [...s].length
}

function pendingReservedOnCard(orders: api.TostiOrder[], cardId: number): number {
  return orders
    .filter((o) => o.status === 'pending' && o.card_id !== null && o.card_id === cardId)
    .reduce((sum, o) => sum + o.quantity, 0)
}

function freeKnipjesForCard(card: api.Card, orders: api.TostiOrder[]): number {
  if (card.source !== 'online') return 0
  return Math.max(0, card.knipjes_remaining - pendingReservedOnCard(orders, card.id))
}

export function OrderTostiPage() {
  const { csrf, refresh, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [cards, setCards] = useState<api.Card[]>([])
  const [orders, setOrders] = useState<api.TostiOrder[]>([])
  const [queue, setQueue] = useState<api.TostiQueueEntry[]>([])
  const [queueLoadError, setQueueLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cardId, setCardId] = useState<number | ''>('')
  const [paymentMode, setPaymentMode] = useState<'digital' | 'physical'>('digital')
  const prevUsableCardsCountRef = useRef<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [bread, setBread] = useState<api.TostiBread>('wit')
  const [filling, setFilling] = useState<api.TostiFilling>('ham')
  const [stallRemark, setStallRemark] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cList, oList] = await Promise.all([api.getCards(), api.getMyTostiOrders()])
      const tostiCards = cList.filter((c) => c.kind === 'tosti')
      setCards(tostiCards)
      setOrders(oList)
      try {
        setQueue(await api.getTostiQueue())
        setQueueLoadError(false)
      } catch {
        setQueue([])
        setQueueLoadError(true)
      }
      const usable = tostiCards.filter((c) => freeKnipjesForCard(c, oList) > 0)
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
      if (
        reason === 'open' ||
        reason === 'my_tosti_orders' ||
        reason === 'tosti_public_queue'
      ) {
        void load()
        void refresh()
      }
    },
    [load, refresh],
  )

  useTostiRealtime('/ws/mijn-tosti', !!user, onMineRealtime, [
    'my_tosti_orders',
    'tosti_public_queue',
  ])

  const usableCards = useMemo(
    () => cards.filter((c) => c.source === 'online' && freeKnipjesForCard(c, orders) > 0),
    [cards, orders],
  )
  const selectedCard = useMemo(
    () => (cardId !== '' ? cards.find((c) => c.id === cardId) : undefined),
    [cards, cardId],
  )
  const freeOnCard = selectedCard ? freeKnipjesForCard(selectedCard, orders) : 0
  const maxDigitalQty = Math.min(10, Math.max(0, freeOnCard))
  const effectiveMaxQty = paymentMode === 'physical' ? 10 : maxDigitalQty

  useEffect(() => {
    const n = usableCards.length
    if (n === 0) {
      setPaymentMode('physical')
    } else if (prevUsableCardsCountRef.current === 0) {
      setPaymentMode('digital')
    }
    prevUsableCardsCountRef.current = n
  }, [usableCards.length])

  useEffect(() => {
    if (effectiveMaxQty <= 0) return
    setQuantity((q) => Math.min(Math.max(1, q), effectiveMaxQty))
  }, [effectiveMaxQty, cardId, paymentMode])

  const queueHint = useMemo(() => {
    const mine = queue.filter((e) => e.is_mine)
    if (mine.length === 0 || queue.length === 0) return null
    const places = mine.map((e) => e.place).sort((a, b) => a - b)
    const total = queue.length
    if (places.length === 1) {
      return `Jouw bestelling staat op plek ${places[0]} van ${total}.`
    }
    return `Jouw ${places.length} bestellingen staan op plek ${places.join(', ')} (totaal ${total} in de wachtrij).`
  }, [queue])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedRemark = stallRemark.trim()
    if (unicodeScalarCount(trimmedRemark) > tostiRemarkMaxChars) {
      void alert({
        title: 'Opmerking te lang',
        message: `Maximaal ${tostiRemarkMaxChars} tekens (inclusief emoji als één teken).`,
        variant: 'error',
      })
      return
    }
    if (paymentMode === 'physical') {
      if (quantity < 1 || quantity > 10) {
        void alert({
          title: 'Aantal',
          message: 'Kies een aantal tussen 1 en 10.',
          variant: 'error',
        })
        return
      }
    } else {
      if (cardId === '' || typeof cardId !== 'number') {
        void alert({
          title: 'Geen kaart',
          message: 'Geen digitale kaart met vrije knipjes. Kies fysieke kaart.',
          variant: 'error',
        })
        return
      }
      if (maxDigitalQty < 1 || quantity < 1 || quantity > maxDigitalQty) {
        void alert({
          title: 'Aantal',
          message:
            maxDigitalQty < 1
              ? 'Geen vrije knipjes meer op deze kaart.'
              : `Kies een aantal tussen 1 en ${maxDigitalQty}.`,
          variant: 'error',
        })
        return
      }
    }
    setSubmitting(true)
    try {
      const remarkOpt = trimmedRemark !== '' ? { remark: trimmedRemark } : {}
      if (paymentMode === 'physical') {
        await api.createTostiOrder(csrf, { physical_card: true, bread, filling, quantity, ...remarkOpt })
      } else {
        await api.createTostiOrder(csrf, { card_id: cardId as number, bread, filling, quantity, ...remarkOpt })
      }
      setStallRemark('')
      await load()
      await refresh()
      if (paymentMode === 'physical') {
        const knipWord = quantity === 1 ? 'knipje' : 'knipjes'
        await alert({
          title: 'Bestelling geplaatst',
          message: `Neem je fysieke kaart mee. Kraam knipt ${quantity === 1 ? '1' : String(quantity)} ${knipWord}.`,
          variant: 'success',
        })
      } else {
        const knipWord = quantity === 1 ? 'knipje' : 'knipjes'
        await alert({
          title: 'Bestelling geplaatst',
          message: `${quantity === 1 ? '1' : String(quantity)} ${knipWord} wordt bij levering afgeschreven.`,
          variant: 'success',
        })
      }
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
      message: 'Deze openstaande bestelling annuleren?',
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
          1 tosti = 1 knipje. Digitaal wordt afgeschreven bij levering. Fysiek wordt bij de kraam geknipt.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Wachtrij</h2>
        <p className="mt-2 text-sm text-slate-600">Oudste eerst; het nummer is je plek in de rij.</p>
        {queueHint ? (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{queueHint}</p>
        ) : null}
        {queueLoadError ? (
          <p className="mt-4 text-amber-800">
            Wachtrij laden mislukt. Vernieuw en probeer opnieuw.
          </p>
        ) : queue.length === 0 ? (
          <p className="mt-4 text-slate-600">Er staan nu geen bestellingen in de wachtrij.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {queue.map((row) => (
              <li
                key={row.id}
                className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  row.is_mine
                    ? 'border-brand-300 bg-brand-50/60'
                    : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-3 sm:items-center">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-800"
                    title="Plek in de wachtrij"
                  >
                    {row.place}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      <span className="text-slate-600">{row.customer_name}</span>
                      {row.is_mine ? (
                        <span className="ml-2 rounded-md bg-brand-700 px-1.5 py-0.5 text-xs font-semibold text-white">
                          Jij
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-700">
                      {row.quantity > 1 ? `${row.quantity}× ` : ''}
                      {breadLabel(row.bread)}, {fillingLabel(row.filling)}
                      <span className="text-slate-500">
                        {' '}
                        ·{' '}
                      {row.is_physical_card ? 'fysieke kaart' : `kaart #${row.card_id}`}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Geplaatst {new Date(row.created_at).toLocaleString('nl-NL')}
                    </p>
                  </div>
                </div>
                {row.is_mine ? (
                  <button
                    type="button"
                    onClick={() => void onCancelPending(row.id)}
                    className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    Annuleren
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card">
        <h2 className="text-lg font-semibold text-slate-900">Nieuwe bestelling</h2>
        {usableCards.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Geen vrije digitale knipjes. Bestel met fysieke kaart of koop een nieuwe kaart.
          </p>
        ) : null}
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-6 grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-8 md:gap-y-4"
        >
          {usableCards.length > 0 ? (
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-medium text-slate-700">Hoe betaal je?</legend>
              <p className="mt-1 text-xs text-slate-600">Gebruik digitaal als je vrije knipjes hebt.</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/50">
                  <input
                    type="radio"
                    name="paymentMode"
                    checked={paymentMode === 'digital'}
                    onChange={() => setPaymentMode('digital')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">
                      Digitale kaart in de app
                      <span className="ml-1.5 font-normal text-brand-800">(aanbevolen)</span>
                    </span>
                    <span className="mt-0.5 block text-slate-600">
                      Afschrijving bij levering.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/50">
                  <input
                    type="radio"
                    name="paymentMode"
                    checked={paymentMode === 'physical'}
                    onChange={() => setPaymentMode('physical')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Fysieke tostikaart</span>
                    <span className="mt-0.5 block text-slate-600">Kraam knipt bij levering.</span>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}

          {paymentMode === 'physical' ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950 md:col-span-2">
              Neem je kaart mee; knippen gebeurt bij de kraam.
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            {paymentMode === 'digital' && usableCards.length > 0 ? (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Kaart (knipjes)</span>
                <select
                  value={cardId === '' ? '' : String(cardId)}
                  onChange={(e) => setCardId(e.target.value ? Number(e.target.value) : '')}
                  className="select-control mt-1.5 w-full max-w-[min(100%,18rem)]"
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
            ) : null}
            <div className="block text-sm">
              <span className="font-medium text-slate-700" id="tosti-qty-label">
                Aantal tosti&apos;s
              </span>
              <div
                className="mt-2 flex max-w-xs items-center gap-2"
                role="group"
                aria-labelledby="tosti-qty-label"
              >
                <button
                  type="button"
                  className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Eén tosti minder"
                  disabled={effectiveMaxQty < 1 || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <div
                  className="min-w-[3rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-center text-lg font-semibold tabular-nums text-slate-900"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {effectiveMaxQty < 1 ? '—' : quantity}
                </div>
                <button
                  type="button"
                  className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-semibold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Eén tosti meer"
                  disabled={effectiveMaxQty < 1 || quantity >= effectiveMaxQty}
                  onClick={() => setQuantity((q) => Math.min(effectiveMaxQty, q + 1))}
                >
                  +
                </button>
              </div>
              <span className="mt-2 block text-xs text-slate-500">
                {paymentMode === 'physical'
                  ? 'Maximaal 10 tosti’s per bestelling.'
                  : effectiveMaxQty < 1
                    ? 'Geen vrije knipjes — kies fysieke kaart of andere kaart.'
                    : `Max. ${effectiveMaxQty} op deze kaart.`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
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
          </div>

          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Opmerking voor de kraam</span>
            <span className="mt-0.5 block text-xs text-slate-500">Optioneel, max. {tostiRemarkMaxChars} tekens.</span>
            <textarea
              value={stallRemark}
              onChange={(e) => setStallRemark(e.target.value)}
              maxLength={tostiRemarkMaxChars}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              //placeholder="Bijv. licht toasten, geen mosterd…"
              aria-label="Opmerking voor de kraam"
            />
          </label>

          <button
            type="submit"
            disabled={
              submitting ||
              (paymentMode === 'digital' && (usableCards.length === 0 || maxDigitalQty < 1 || cardId === ''))
            }
            className="btn-primary px-5 md:col-span-2"
          >
            {submitting ? 'Bezig…' : 'Bestelling plaatsen'}
          </button>
        </form>
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
                  <span className="text-slate-400">
                    {' '}
                    · {new Date(o.created_at).toLocaleString('nl-NL')}
                    {o.is_physical_card ? ' · fysieke kaart' : ''}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
