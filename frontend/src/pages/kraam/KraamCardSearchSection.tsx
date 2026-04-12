import { cardKindBadgeClass, cardKindLabel } from './kraamFormat'
import type { OperatorCardRow } from '../../api'

type Props = {
  q: string
  onQueryChange: (q: string) => void
  loading: boolean
  rows: OperatorCardRow[]
  busyId: number | null
  onRefreshAll: () => void | Promise<void>
  onUseKnipje: (c: OperatorCardRow) => void
}

export function KraamCardSearchSection({
  q,
  onQueryChange,
  loading,
  rows,
  busyId,
  onRefreshAll,
  onUseKnipje,
}: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Kaarten & handmatig knipje</h2>
      <p className="text-slate-600">Zoek op kaartnummer, naam of e-mail. Alleen tostikaarten: handmatig knipje.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Zoek…"
          className="input-control min-h-11 max-w-md rounded-xl"
          aria-label="Zoek kaarten"
        />
        <button
          type="button"
          onClick={() => void onRefreshAll()}
          className="btn-secondary min-h-11 rounded-xl px-4"
        >
          Alles vernieuwen
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-slate-600">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Geen kaarten gevonden. Probeer een ander zoekwoord of laat leeg voor de nieuwste kaarten.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-mono text-xs text-slate-500">
                  Kaart #{c.id}{' '}
                  <span className={cardKindBadgeClass(c.kind)}>{cardKindLabel(c.kind)}</span>
                  {c.source === 'physical' ? (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-amber-900">
                      Fysiek (schatting)
                    </span>
                  ) : null}
                </p>
                <p className="font-semibold text-slate-900">{c.owner_name}</p>
                <p className="text-sm text-slate-600">{c.owner_email}</p>
                <p className="mt-1 text-sm text-slate-700">
                  <strong>{c.knipjes_remaining}</strong> / 10 knipjes
                </p>
              </div>
              {c.knipjes_remaining <= 0 ? (
                <span className="text-sm text-slate-400">Op</span>
              ) : (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void onUseKnipje(c)}
                  className="min-h-11 shrink-0 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
                >
                  {busyId === c.id ? 'Bezig…' : '1 knipje gebruiken'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
