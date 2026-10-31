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
          <h2 className="text-xl font-semibold text-ink">Tosti-bestellingen</h2>
          <p className="text-sm text-ink-muted">
            Oudste eerst. Digitale kaart: knipjes gaan er bij "Geleverd" af. Fysieke kaart: knip zelf op de kaart.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefreshQueue()}
          className="btn-secondary shrink-0"
        >
          Wachtrij vernieuwen
        </button>
      </div>
      {loadingOrders && orders.length === 0 ? (
        <p className="text-ink-muted">Bestellingen laden…</p>
      ) : orders.length === 0 ? (
        <p className="surface-card border-dashed text-center text-ink-muted">
          Geen openstaande tostibestellingen.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o, idx) => {
            const physical = isPhysicalTostiOrder(o)
            return (
              <li
                key={o.id}
                className={`flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between ${
                  idx === 0 ? 'border-l-4 border-l-accent-400' : ''
                }`}
              >
                <div className="flex gap-4">
                  <span
                    className="w-10 shrink-0 font-display text-2xl font-bold leading-9 text-brand-900"
                    title="Plek in de wachtrij"
                  >
                    #{idx + 1}
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                      {o.customer_name}
                      {physical ? <span className="pill-pending">Fysieke kaart · knip zelf</span> : null}
                    </p>
                    <p className="text-sm text-ink-muted">{o.customer_email}</p>
                    <p className="mt-1 text-ink">
                      <strong>
                        {o.quantity > 1 ? `${o.quantity}× ` : ''}
                        {breadLabel(o.bread, 'short')} brood, {fillingLabel(o.filling)}
                      </strong>
                      {o.quantity > 1 ? (
                        <span className="ml-2 text-sm font-normal text-ink-muted">({o.quantity} knipjes)</span>
                      ) : null}
                    </p>
                    {o.remark ? <p className="mt-1 text-sm italic text-ink">&ldquo;{o.remark}&rdquo;</p> : null}
                    <p className="text-xs text-ink-muted">
                      {physical ? '' : `Kaart #${o.card_id} · `}
                      {new Date(o.created_at).toLocaleString('nl-NL')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyOrder !== null}
                    onClick={() => void onDeliverOrder(o)}
                    className="btn-success min-h-12 px-6"
                  >
                    {busyOrder?.id === o.id && busyOrder.action === 'deliver' ? 'Bezig…' : 'Geleverd'}
                  </button>
                  <button
                    type="button"
                    disabled={busyOrder !== null}
                    onClick={() => void onCancelOrder(o)}
                    className="btn-secondary min-h-12"
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
