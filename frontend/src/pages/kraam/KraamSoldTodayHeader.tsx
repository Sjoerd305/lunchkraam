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
        <p className="eyebrow">Kraam</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Wachtrij</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {soldTodayLoading ? (
            'Verkocht vandaag: laden…'
          ) : soldToday ? (
            <>
              Vandaag <strong className="text-ink">{soldToday.quantity}</strong>{' '}
              {soldToday.quantity === 1 ? 'tosti' : 'tosti’s'} geleverd · {formatAmsterdamDateLong(soldToday.amsterdam_date)}
            </>
          ) : (
            <span className="text-accent-800">Kon het dagtotaal niet laden.</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onRefreshAll()}
        className="btn-secondary self-start lg:self-auto"
      >
        Alles vernieuwen
      </button>
    </div>
  )
}
