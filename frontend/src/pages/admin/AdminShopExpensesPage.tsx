import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../AuthContext'
import { useAlertDialog } from '../../components/AlertDialogProvider'

function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shopExpensePurposeLabel(p: api.ShopExpensePurpose): string {
  return p === 'avondeten' ? 'Avondeten' : 'Lunchkraam'
}

export function AdminShopExpensesPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [yearsLoading, setYearsLoading] = useState(true)
  const [rows, setRows] = useState<api.AdminShopExpense[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(todayISO)
  const [purpose, setPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [description, setDescription] = useState('')
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [receiptsByExpenseId, setReceiptsByExpenseId] = useState<Record<number, api.ShopExpenseReceipt | null>>({})
  const [uploadingReceiptId, setUploadingReceiptId] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      setYearsLoading(true)
      try {
        const ys = isOperatorOnly
          ? await api.getOperatorSalesYears()
          : await api.getAdminSalesYears()
        setYears(ys)
        setYear((prev) => {
          if (prev !== null && ys.includes(prev)) return prev
          return ys[0] ?? new Date().getFullYear()
        })
      } catch (e) {
        setYears([])
        setYear(new Date().getFullYear())
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' })
      } finally {
        setYearsLoading(false)
      }
    })()
  }, [user, isOperatorOnly, alert])

  const loadList = useCallback(
    async (y: number) => {
      setListLoading(true)
      try {
        const list = isOperatorOnly
          ? await api.getOperatorShopExpenses(y)
          : await api.getAdminShopExpenses(y)
        setRows(list)
        const receiptEntries = await Promise.all(
          list.map(async (row) => {
            try {
              const receipt = await api.getShopExpenseReceipt(row.id, isOperatorOnly)
              return [row.id, receipt] as const
            } catch {
              return [row.id, null] as const
            }
          }),
        )
        setReceiptsByExpenseId(Object.fromEntries(receiptEntries))
      } catch (e) {
        setRows([])
        setReceiptsByExpenseId({})
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Uitgaven laden mislukt', message: msg, variant: 'error' })
      } finally {
        setListLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

  useEffect(() => {
    if (year === null) return
    void loadList(year)
  }, [year, loadList])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (year === null) return
    if (!newReceiptFile) {
      void alert({
        title: 'Bonfoto verplicht',
        message: 'Selecteer eerst een bonfoto voordat je de uitgave toevoegt.',
        variant: 'error',
      })
      return
    }
    const n = parseFloat(String(amount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      void alert({ title: 'Ongeldig bedrag', message: 'Vul een positief getal in.', variant: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const body = { amount_eur: n, spent_on: spentOn, description: description.trim(), purpose }
      const createdExpense = isOperatorOnly
        ? await api.createOperatorShopExpense(csrf, body)
        : await api.createShopExpense(csrf, body)
      await api.uploadShopExpenseReceipt(csrf, createdExpense.id, newReceiptFile, isOperatorOnly)
      setAmount('')
      setDescription('')
      setPurpose('lunchkraam')
      setSpentOn(todayISO())
      setNewReceiptFile(null)
      await loadList(year)
      void alert({ title: 'Opgeslagen', message: 'Uitgave is toegevoegd.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const yearOptions = useMemo(() => {
    const yNow = new Date().getFullYear()
    const base = years.length > 0 ? [...years] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [years, year])

  async function onDelete(id: number) {
    const ok = await confirm({
      title: 'Uitgave verwijderen?',
      message: 'Dit kan niet ongedaan worden gemaakt.',
      tone: 'danger',
      confirmLabel: 'Verwijderen',
    })
    if (!ok || year === null) return
    try {
      await api.deleteShopExpense(csrf, id)
      await loadList(year)
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  async function onUploadReceipt(expenseId: number, file: File | null) {
    if (!file || year === null) return
    setUploadingReceiptId(expenseId)
    try {
      const receipt = await api.uploadShopExpenseReceipt(csrf, expenseId, file, isOperatorOnly)
      setReceiptsByExpenseId((prev) => ({ ...prev, [expenseId]: receipt }))
      await alert({ title: 'Bonfoto opgeslagen', message: 'De bonfoto is toegevoegd.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Uploaden mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setUploadingReceiptId(null)
    }
  }

  async function onDeleteReceipt(expenseId: number) {
    if (year === null) return
    const ok = await confirm({
      title: 'Bonfoto verwijderen?',
      message: 'Dit kan niet ongedaan worden gemaakt.',
      tone: 'danger',
      confirmLabel: 'Verwijderen',
    })
    if (!ok) return
    try {
      await api.deleteShopExpenseReceipt(csrf, expenseId)
      setReceiptsByExpenseId((prev) => ({ ...prev, [expenseId]: null }))
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  function onNewReceiptFileSelected(file: File | null) {
    setNewReceiptFile(file)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Boodschappen &amp; uitgaven</h2>
        <p className="mt-2 text-slate-600">
          Boek boodschappen voor de lunchkraam en voor het avondeten (beide uit dezelfde omzet). Omzet = geaccordeerde
          kaartverkopen dit jaar; uitgaven = alle geboekte boodschappen dit jaar.
          {isOperatorOnly ? ' Verkochte tosti’s op basis van levermoment.' : ''}
        </p>
      </div>

      <section className="surface-card">
        <h3 className="text-sm font-semibold text-slate-800">Nieuwe uitgave</h3>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Bedrag (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="12,50"
              className="input-control mt-1.5"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Datum bon / aankoop</span>
            <input
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className="input-control mt-1.5"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Waarvoor</span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as api.ShopExpensePurpose)}
              className="select-control mt-1.5 min-h-11 w-full"
            >
              <option value="lunchkraam">Lunchkraam</option>
              <option value="avondeten">Avondeten</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="font-medium text-slate-700">Omschrijving (optioneel)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="bijv. Albert Heijn, brood"
              className="input-control mt-1.5"
            />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="font-medium text-slate-700">Bonfoto (verplicht)</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <label className="btn-secondary inline-flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onNewReceiptFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <label className="btn-secondary inline-flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                Galerij
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onNewReceiptFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
            {newReceiptFile ? <span className="mt-1 block text-xs text-slate-600">{newReceiptFile.name}</span> : null}
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={submitting || year === null || !newReceiptFile}
              className="btn-primary min-h-11 px-5"
            >
              {submitting ? 'Bezig…' : 'Toevoegen'}
            </button>
          </div>
        </form>
      </section>

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
                onChange={(e) => setYear(Number(e.target.value))}
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
            Geen uitgaven in {year ?? 'dit jaar'}.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Datum</th>
                  <th className="py-2 pr-4">Bedrag</th>
                  <th className="py-2 pr-4">Waarvoor</th>
                  <th className="py-2 pr-4">Omschrijving</th>
                  <th className="py-2 pr-4">Bon</th>
                  {user?.is_admin ? <th className="py-2 text-right">Actie</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 tabular-nums text-slate-800">{r.spent_on}</td>
                    <td className="py-3 pr-4 font-medium tabular-nums text-slate-900">
                      {formatEUR(r.amount_eur)}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{shopExpensePurposeLabel(r.purpose)}</td>
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
                        {receiptsByExpenseId[r.id] ? (
                          <>
                            <a
                              href={receiptsByExpenseId[r.id]?.image_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-slate-700 underline"
                            >
                              Bekijk
                            </a>
                            {user?.is_admin ? (
                              <button
                                type="button"
                                onClick={() => void onDeleteReceipt(r.id)}
                                className="text-xs font-semibold text-red-700 hover:text-red-900"
                              >
                                Verwijder foto
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">Geen foto</span>
                        )}
                      </div>
                    </td>
                    {user?.is_admin ? (
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onDelete(r.id)}
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
    </div>
  )
}
