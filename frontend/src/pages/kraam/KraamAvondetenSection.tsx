import type { AvondetenRegistrationCard } from '../../api'

type Props = {
  avondetenMealDate: string
  onMealDateChange: (date: string) => void
  avondetenLoading: boolean
  avondetenRows: AvondetenRegistrationCard[]
  avondetenPicked: number[]
  avondetenPickableIds: Set<number>
  avondetenSubmitting: boolean
  onTogglePick: (cardId: number) => void
  onRefresh: () => void
  onSubmit: () => void
}

export function KraamAvondetenSection({
  avondetenMealDate,
  onMealDateChange,
  avondetenLoading,
  avondetenRows,
  avondetenPicked,
  avondetenPickableIds,
  avondetenSubmitting,
  onTogglePick,
  onRefresh,
  onSubmit,
}: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-brand-200/90 bg-brand-50/50 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
          <h2 className="text-lg font-semibold text-brand-950">Avondeten</h2>
          <label className="flex max-w-[11rem] flex-col gap-1 text-sm">
            <span className="font-medium text-brand-950">Datum</span>
            <input
              type="date"
              value={avondetenMealDate}
              onChange={(e) => onMealDateChange(e.target.value)}
              className="input-control min-h-11 rounded-xl"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="min-h-10 shrink-0 rounded-xl border border-brand-300/80 bg-white px-4 py-2 text-sm font-semibold text-brand-950 shadow-sm hover:bg-brand-100/50"
        >
          Vernieuwen
        </button>
      </div>
      {avondetenLoading ? (
        <p className="text-sm text-brand-900/80">Laden…</p>
      ) : avondetenRows.length === 0 ? (
        <p className="text-sm text-brand-900/80">Geen avondetenkaarten.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-brand-100 bg-brand-50/80 text-xs font-semibold uppercase tracking-wide text-brand-900/70">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Naam</th>
                  <th className="px-3 py-2.5">Kaart</th>
                  <th className="px-3 py-2.5">Knipjes</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {avondetenRows.map((r) => {
                  const canPick = avondetenPickableIds.has(r.card_id)
                  const checked = avondetenPicked.includes(r.card_id)
                  return (
                    <tr key={r.card_id} className={r.registered_for_date ? 'bg-slate-50/80' : ''}>
                      <td className="px-3 py-2.5">
                        {canPick ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                            checked={checked}
                            onChange={() => onTogglePick(r.card_id)}
                            aria-label={`Mee-eten ${r.owner_name}`}
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{r.owner_name}</div>
                        <div className="text-xs text-slate-500">{r.owner_email}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">#{r.card_id}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.knipjes_remaining} / 10</td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {r.registered_for_date ? (
                          <span className="text-brand-800">Geregistreerd</span>
                        ) : r.knipjes_remaining <= 0 ? (
                          <span className="text-slate-500">Op</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <span className="text-sm text-brand-900/85 sm:mr-auto">
              Geselecteerd: <strong>{avondetenPicked.length}</strong>
            </span>
            <button
              type="button"
              disabled={avondetenSubmitting || avondetenPicked.length === 0}
              onClick={() => void onSubmit()}
              className="min-h-11 rounded-xl bg-brand-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {avondetenSubmitting ? 'Bezig…' : 'Afboeken'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
