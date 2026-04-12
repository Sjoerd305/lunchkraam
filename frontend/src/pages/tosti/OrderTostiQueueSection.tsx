import { breadLabel, fillingLabel } from '../../utils/tostiLabels'
import type { TostiQueueEntry } from '../../api'

type Props = {
  queue: TostiQueueEntry[]
  queueLoadError: boolean
  queueHint: string | null
  onCancelPending: (orderId: number) => void
}

export function OrderTostiQueueSection({ queue, queueLoadError, queueHint, onCancelPending }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Wachtrij</h2>
      <p className="mt-2 text-sm text-slate-600">Oudste eerst; het nummer is je plek in de rij.</p>
      {queueHint ? (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{queueHint}</p>
      ) : null}
      {queueLoadError ? (
        <p className="mt-4 text-amber-800">Wachtrij laden mislukt. Vernieuw en probeer opnieuw.</p>
      ) : queue.length === 0 ? (
        <p className="mt-4 text-slate-600">Er staan nu geen bestellingen in de wachtrij.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {queue.map((row) => (
            <li
              key={row.id}
              className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                row.is_mine ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-slate-50/80'
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
                  <p className="text-xs text-slate-500">Geplaatst {new Date(row.created_at).toLocaleString('nl-NL')}</p>
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
  )
}
