import type * as api from '../../api'
import { formatEUR } from '../../utils/formatMoney'
import {
  shopExpenseKindBadgeClass,
  shopExpenseKindLabel,
  shopExpensePurposeLabel,
} from './adminShopExpensesHelpers'

export type AdminShopExpensesTableProps = {
  yearsLoading: boolean
  year: number | null
  yearOptions: number[]
  onYearChange: (year: number) => void
  listLoading: boolean
  rows: api.AdminShopExpense[]
  receiptsByExpenseId: Record<number, api.ShopExpenseReceipt[]>
  patchingPurposeId: number | null
  uploadingReceiptId: number | null
  isAdmin: boolean | undefined
  onPurposeChange: (expenseId: number, purpose: api.ShopExpensePurpose) => void
  onUploadReceipt: (expenseId: number, file: File | null) => void
  onDeleteReceipt: (expenseId: number, receiptId: number) => void
  onDeleteExpense: (expenseId: number) => void
}

export function AdminShopExpensesTable(props: AdminShopExpensesTableProps) {
  const {
    yearsLoading,
    year,
    yearOptions,
    onYearChange,
    listLoading,
    rows,
    receiptsByExpenseId,
    patchingPurposeId,
    uploadingReceiptId,
    isAdmin,
    onPurposeChange,
    onUploadReceipt,
    onDeleteReceipt,
    onDeleteExpense,
  } = props

  return (
    <section className="surface-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Boekingen</h3>
        {yearsLoading ? (
          <span className="text-sm text-slate-500">Jaren laden…</span>
        ) : year !== null ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="font-medium">Jaar</span>
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="select-control min-h-10"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {listLoading ? (
        <p className="mt-6 text-sm text-slate-600">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-600">
          Geen boekingen in {year ?? 'dit jaar'}.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Bedrag</th>
                <th className="py-2 pr-4">Soort</th>
                <th className="py-2 pr-4">Waarvoor</th>
                <th className="py-2 pr-4">Bron</th>
                <th className="py-2 pr-4">Omschrijving</th>
                <th className="py-2 pr-4">Bon</th>
                {isAdmin ? <th className="py-2 text-right">Actie</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 tabular-nums text-slate-800">{r.spent_on}</td>
                  <td className="py-3 pr-4 font-medium tabular-nums text-slate-900">{formatEUR(r.amount_eur)}</td>
                  <td className="py-3 pr-4 text-xs text-slate-600">
                    <span className={shopExpenseKindBadgeClass(r)}>{shopExpenseKindLabel(r)}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    <select
                      value={r.purpose}
                      disabled={patchingPurposeId === r.id}
                      onChange={(e) => onPurposeChange(r.id, e.target.value as api.ShopExpensePurpose)}
                      className="select-control min-h-9 max-w-[12rem] text-xs"
                      aria-label={`Waarvoor voor uitgave ${r.spent_on}`}
                    >
                      <option value="lunchkraam">{shopExpensePurposeLabel('lunchkraam')}</option>
                      <option value="avondeten">{shopExpensePurposeLabel('avondeten')}</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-600">
                    {r.source === 'revolut' ? 'Revolut' : 'Handmatig'}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{r.description || '—'}</td>
                  <td className="py-3 pr-4 text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn-secondary inline-flex min-h-9 cursor-pointer items-center px-3 text-xs">
                        {uploadingReceiptId === r.id ? 'Uploaden…' : 'Camera'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={uploadingReceiptId === r.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null
                            void onUploadReceipt(r.id, file)
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                      <label className="btn-secondary inline-flex min-h-9 cursor-pointer items-center px-3 text-xs">
                        {uploadingReceiptId === r.id ? 'Uploaden…' : 'Galerij'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingReceiptId === r.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null
                            void onUploadReceipt(r.id, file)
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                      {(receiptsByExpenseId[r.id] ?? []).length === 0 ? (
                        <span className="text-xs text-slate-500">Geen foto</span>
                      ) : (
                        <ul className="list-none space-y-1.5 p-0">
                          {(receiptsByExpenseId[r.id] ?? []).map((rec, idx) => (
                            <li key={rec.id} className="flex flex-wrap items-center gap-2">
                              <a
                                href={rec.image_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-slate-700 underline"
                              >
                                Bekijk
                                {(receiptsByExpenseId[r.id] ?? []).length > 1 ? ` ${idx + 1}` : ''}
                              </a>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => void onDeleteReceipt(r.id, rec.id)}
                                  className="text-xs font-semibold text-red-700 hover:text-red-900"
                                >
                                  Verwijderen
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </td>
                  {isAdmin ? (
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onDeleteExpense(r.id)}
                        className="text-sm font-semibold text-red-700 hover:text-red-900"
                      >
                        Verwijderen
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
