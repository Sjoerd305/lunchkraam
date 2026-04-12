import { breadLabel, fillingLabel } from '../../utils/tostiLabels'
import { isPhysicalTostiOrder } from './kraamFormat'
import type { OperatorTostiOrderRow } from '../../api'

type BusyOrder = { id: number; action: 'deliver' | 'cancel' } | null

type Props = {
  loadingOrders: boolean
  orders: OperatorTostiOrderRow[]
  busyOrder: BusyOrder
  onRefreshQueue: () => void
  onDeliverOrder: (o: OperatorTostiOrderRow) => void
  onCancelOrder: (o: OperatorTostiOrderRow) => void
}

export function KraamTostiQueueSection({
  loadingOrders,
  orders,
  busyOrder,
  onRefreshQueue,
  onDeliverOrder,
  onCancelOrder,
}: Props) {
  return (
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
          onClick={() => void onRefreshQueue()}
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
                  physical ? 'border-amber-300/90 bg-amber-50/50' : 'border-slate-200 bg-white'
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
                      {breadLabel(o.bread, 'short')} brood, {fillingLabel(o.filling)}
                    </strong>
                    {o.quantity > 1 ? (
                      <span className="ml-2 text-sm font-normal text-slate-600">({o.quantity} knipjes)</span>
                    ) : null}
                  </p>
                  {o.remark ? (
                    <p className="mt-1 text-sm italic text-slate-700">&ldquo;{o.remark}&rdquo;</p>
                  ) : null}
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
  )
}
