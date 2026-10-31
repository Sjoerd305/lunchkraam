import { formatAmsterdamDateLong } from './kraamFormat'
import type { OperatorTostiSoldToday } from '../../api'

type Props = {
  soldTodayLoading: boolean
  soldToday: OperatorTostiSoldToday | null
  onRefreshAll: () => void
}

/** Compacte kop: titel, dagtotaal en één knop om alles te verversen. */
export function KraamSoldTodayHeader({ soldTodayLoading, soldToday, onRefreshAll }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kraam</h1>
        <p className="mt-1 text-sm text-slate-600">
          {soldTodayLoading ? (
            'Verkocht vandaag: laden…'
          ) : soldToday ? (
            <>
              Vandaag <strong className="text-slate-900">{soldToday.quantity}</strong>{' '}
              {soldToday.quantity === 1 ? 'tosti' : 'tosti’s'} geleverd · {formatAmsterdamDateLong(soldToday.amsterdam_date)}
            </>
          ) : (
            <span className="text-amber-800">Kon het dagtotaal niet laden.</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onRefreshAll()}
        className="btn-secondary min-h-10 self-start rounded-xl px-4 lg:self-auto"
      >
        Alles vernieuwen
      </button>
    </div>
  )
}
