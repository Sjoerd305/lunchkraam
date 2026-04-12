import { breadLabel, fillingLabel } from '../../utils/tostiLabels'
import type { TostiOrder } from '../../api'

type Props = {
  orders: TostiOrder[]
}

export function OrderTostiRecentSection({ orders }: Props) {
  if (!orders.some((o) => o.status !== 'pending')) return null

  return (
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
                <span className="text-brand-700">geleverd</span>
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
  )
}
