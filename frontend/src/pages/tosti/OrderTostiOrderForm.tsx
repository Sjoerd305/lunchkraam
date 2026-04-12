import type { FormEvent } from 'react'
import { breadLabel } from '../../utils/tostiLabels'
import { freeKnipjesForCard, TOSTI_REMARK_MAX_CHARS } from '../../utils/tostiOrderUtils'
import type { Card, TostiBread, TostiFilling, TostiOrder } from '../../api'

type PaymentMode = 'digital' | 'physical'

type Props = {
  onSubmit: (e: FormEvent) => void
  usableCards: Card[]
  orders: TostiOrder[]
  paymentMode: PaymentMode
  setPaymentMode: (m: PaymentMode) => void
  cardId: number | ''
  setCardId: (id: number | '') => void
  quantity: number
  setQuantity: (q: number | ((prev: number) => number)) => void
  bread: TostiBread
  setBread: (b: TostiBread) => void
  filling: TostiFilling
  setFilling: (f: TostiFilling) => void
  stallRemark: string
  setStallRemark: (s: string) => void
  submitting: boolean
  maxDigitalQty: number
  effectiveMaxQty: number
}

export function OrderTostiOrderForm({
  onSubmit,
  usableCards,
  orders,
  paymentMode,
  setPaymentMode,
  cardId,
  setCardId,
  quantity,
  setQuantity,
  bread,
  setBread,
  filling,
  setFilling,
  stallRemark,
  setStallRemark,
  submitting,
  maxDigitalQty,
  effectiveMaxQty,
}: Props) {
  return (
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
                  <span className="mt-0.5 block text-slate-600">Afschrijving bij levering.</span>
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
                  <input type="radio" name="bread" value={b} checked={bread === b} onChange={() => setBread(b)} />
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
          <span className="mt-0.5 block text-xs text-slate-500">Optioneel, max. {TOSTI_REMARK_MAX_CHARS} tekens.</span>
          <textarea
            value={stallRemark}
            onChange={(e) => setStallRemark(e.target.value)}
            maxLength={TOSTI_REMARK_MAX_CHARS}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
  )
}
