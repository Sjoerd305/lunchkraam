import { formatAmsterdamDateLong } from './kraamFormat'
import type { OperatorTostiSoldToday } from '../../api'

type Props = {
  soldTodayLoading: boolean
  soldToday: OperatorTostiSoldToday | null
}

export function KraamSoldTodayHeader({ soldTodayLoading, soldToday }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
      <h1 className="text-2xl font-bold text-slate-900 lg:shrink-0">Lunchkraam</h1>
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:max-w-md lg:shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verkocht vandaag</p>
        {soldTodayLoading ? (
          <p className="mt-2 text-sm text-slate-600">Laden…</p>
        ) : soldToday ? (
          <>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{soldToday.quantity}</p>
            <p className="mt-1 text-sm text-slate-700">
              {soldToday.quantity === 1 ? 'tosti geleverd' : 'tosti’s geleverd'}
            </p>
            <p className="mt-2 text-xs text-slate-500">{formatAmsterdamDateLong(soldToday.amsterdam_date)}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-amber-800">Kon het totaal niet laden. Vernieuw de pagina.</p>
        )}
      </div>
    </div>
  )
}
