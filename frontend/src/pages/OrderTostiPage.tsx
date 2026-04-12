import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'
import { useTostiRealtime } from '../useTostiRealtime'
import {
  freeKnipjesForCard,
  TOSTI_REMARK_MAX_CHARS,
  unicodeScalarCount,
} from '../utils/tostiOrderUtils'
import { OrderTostiOrderForm } from './tosti/OrderTostiOrderForm'
import { OrderTostiQueueSection } from './tosti/OrderTostiQueueSection'
import { OrderTostiRecentSection } from './tosti/OrderTostiRecentSection'

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
    if (unicodeScalarCount(trimmedRemark) > TOSTI_REMARK_MAX_CHARS) {
      void alert({
        title: 'Opmerking te lang',
        message: `Maximaal ${TOSTI_REMARK_MAX_CHARS} tekens (inclusief emoji als één teken).`,
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

      <OrderTostiQueueSection
        queue={queue}
        queueLoadError={queueLoadError}
        queueHint={queueHint}
        onCancelPending={onCancelPending}
      />

      <OrderTostiOrderForm
        onSubmit={onSubmit}
        usableCards={usableCards}
        orders={orders}
        paymentMode={paymentMode}
        setPaymentMode={setPaymentMode}
        cardId={cardId}
        setCardId={setCardId}
        quantity={quantity}
        setQuantity={setQuantity}
        bread={bread}
        setBread={setBread}
        filling={filling}
        setFilling={setFilling}
        stallRemark={stallRemark}
        setStallRemark={setStallRemark}
        submitting={submitting}
        maxDigitalQty={maxDigitalQty}
        effectiveMaxQty={effectiveMaxQty}
      />

      <OrderTostiRecentSection orders={orders} />
    </div>
  )
}
