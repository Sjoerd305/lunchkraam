import type { ReactNode } from 'react'
import type { AdminRequest } from '../api'

export function canRejectPaymentRequest(knipjesRemaining: number): boolean {
  return knipjesRemaining === 10
}

function requestKindLabel(r: AdminRequest): string {
  return r.kind === 'avondeten' ? 'Avondetenkaart' : 'Tostikaart'
}

type LayoutMode = 'responsive' | 'cards-only'

type Props = {
  title?: string
  intro?: ReactNode
  rows: AdminRequest[]
  busyId: number | null
  onFulfill: (id: number, knipjesRemaining: number) => void
  onReject: (id: number) => void
  canManageRequest?: (row: AdminRequest) => boolean
  layout?: LayoutMode
}

export function PaymentRequestsPanel({
  title,
  intro,
  rows,
  busyId,
  onFulfill,
  onReject,
  canManageRequest,
  layout = 'responsive',
}: Props) {
  const cardsOnly = layout === 'cards-only'
  const mayManage = (row: AdminRequest): boolean => (canManageRequest ? canManageRequest(row) : true)

  return (
    <div className="space-y-4">
      {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : null}
      {intro ? <div className="max-w-3xl text-sm text-slate-600">{intro}</div> : null}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
          Geen openstaande betalingsaanvragen.
        </p>
      ) : (
        <>
          <ul className={`space-y-3 ${cardsOnly ? '' : 'md:hidden'}`}>
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md">
                <div className="mb-3 flex items-start justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono">#{r.id}</span>
                  <span className="shrink-0 text-right">
                    {new Date(r.created_at).toLocaleString('nl-NL')}
                  </span>
                </div>
                <p className="font-medium text-slate-900">{r.user_name}</p>
                <p className="mt-1 break-all text-sm text-slate-600">{r.user_email}</p>
                <p className="mt-2 text-xs font-semibold text-slate-700">{requestKindLabel(r)}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Nog op de kaart: <strong>{r.knipjes_remaining ?? 10}</strong> / 10 knipjes
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={busyId !== null || !mayManage(r)}
                    onClick={() => onFulfill(r.id, r.knipjes_remaining ?? 10)}
                    className={`min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed ${
                      mayManage(r)
                        ? 'bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {busyId === r.id ? '…' : 'Betaling accorderen'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      busyId !== null || !mayManage(r) || !canRejectPaymentRequest(r.knipjes_remaining ?? 10)
                    }
                    title={
                      !mayManage(r)
                        ? 'Alleen beheerders mogen avondetenaanvragen afhandelen.'
                        : canRejectPaymentRequest(r.knipjes_remaining ?? 10)
                        ? undefined
                        : 'Niet weigeren na knipjegebruik — accorderen.'
                    }
                    onClick={() => onReject(r.id)}
                    className={`min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed ${
                      mayManage(r)
                        ? 'border border-red-200 bg-white text-red-800 hover:bg-red-50 disabled:opacity-50'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    }`}
                  >
                    {busyId === r.id ? '…' : 'Weigeren (geen betaling)'}
                  </button>
                  {!mayManage(r) ? (
                    <p className="text-xs text-slate-500">Alleen een beheerder kan deze avondetenaanvraag afhandelen.</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {!cardsOnly ? (
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md md:block">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Lid</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Aangevraagd</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Resterend</th>
                    <th className="px-4 py-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-slate-600">{r.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.user_name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.user_email}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(r.created_at).toLocaleString('nl-NL')}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{requestKindLabel(r)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.knipjes_remaining ?? 10} / 10 knipjes
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId !== null || !mayManage(r)}
                            onClick={() => onFulfill(r.id, r.knipjes_remaining ?? 10)}
                            className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed ${
                              mayManage(r)
                                ? 'bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {busyId === r.id ? '…' : 'Accorderen'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              busyId !== null || !mayManage(r) || !canRejectPaymentRequest(r.knipjes_remaining ?? 10)
                            }
                            title={
                              !mayManage(r)
                                ? 'Alleen beheerders mogen avondetenaanvragen afhandelen.'
                                : canRejectPaymentRequest(r.knipjes_remaining ?? 10)
                                ? undefined
                                : 'Niet weigeren na knipjegebruik — accorderen.'
                            }
                            onClick={() => onReject(r.id)}
                            className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed ${
                              mayManage(r)
                                ? 'border border-red-200 bg-white text-red-800 hover:bg-red-50 disabled:opacity-50'
                                : 'border border-slate-200 bg-slate-100 text-slate-500'
                            }`}
                          >
                            Weigeren
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
