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

function breadLabel(b: string): string {
  return b === 'bruin' ? 'Bruin brood' : 'Wit brood'
}

function fillingLabel(f: string): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}

function shopExpensePurposeLabel(p: api.ShopExpensePurpose): string {
  return p === 'avondeten' ? 'Avondeten' : 'Lunchkraam'
}

function FinanceStatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'amber' | 'emerald' | 'slate'
}) {
  const ring =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/80'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/80'
        : tone === 'slate'
          ? 'border-slate-200 bg-slate-50/80'
          : 'border-slate-200 bg-white'

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1.5 text-sm text-slate-600">{hint}</p> : null}
    </div>
  )
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
  const [salesStats, setSalesStats] = useState<api.AdminSalesStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(todayISO)
  const [purpose, setPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      } catch (e) {
        setRows([])
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Uitgaven laden mislukt', message: msg, variant: 'error' })
      } finally {
        setListLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

  const loadStats = useCallback(
    async (y: number) => {
      setStatsLoading(true)
      try {
        const s = isOperatorOnly
          ? await api.getOperatorSalesStats(y)
          : await api.getAdminSalesStats(y)
        setSalesStats(s)
      } catch (e) {
        setSalesStats(null)
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Cijfers laden mislukt', message: msg, variant: 'error' })
      } finally {
        setStatsLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

  useEffect(() => {
    if (year === null) return
    void loadList(year)
    void loadStats(year)
  }, [year, loadList, loadStats])

  const tostiRowsByMonth = useMemo(() => {
    if (!salesStats) return []
    const qtyByMonth = new Map(salesStats.tosti_monthly.map((t) => [t.month, t.quantity]))
    return salesStats.monthly.map((fin) => ({
      label: fin.label_nl,
      month: fin.month,
      quantity: qtyByMonth.get(fin.month) ?? 0,
    }))
  }, [salesStats])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (year === null) return
    const n = parseFloat(String(amount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      void alert({ title: 'Ongeldig bedrag', message: 'Vul een positief getal in.', variant: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const body = { amount_eur: n, spent_on: spentOn, description: description.trim(), purpose }
      if (isOperatorOnly) {
        await api.createOperatorShopExpense(csrf, body)
      } else {
        await api.createShopExpense(csrf, body)
      }
      setAmount('')
      setDescription('')
      setPurpose('lunchkraam')
      setSpentOn(todayISO())
      await loadList(year)
      await loadStats(year)
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
      await loadStats(year)
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
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

      {year !== null && (statsLoading || salesStats) ? (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Financieel overzicht ({year})</h3>
          {statsLoading && !salesStats ? (
            <p className="text-sm text-slate-600">Cijfers laden…</p>
          ) : salesStats ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FinanceStatCard
                  label="Kaarten dit jaar"
                  value={String(salesStats.year_breakdown.cards_sold.total)}
                  tone="default"
                  hint={`${salesStats.year_breakdown.cards_sold.tosti} tosti · ${salesStats.year_breakdown.cards_sold.avondeten} avondeten`}
                />
                <FinanceStatCard
                  label="Omzet dit jaar"
                  value={formatEUR(salesStats.year_revenue_eur)}
                  tone="emerald"
                  hint={`Tosti ${formatEUR(salesStats.year_breakdown.revenue_eur.tosti)} · Avondeten ${formatEUR(
                    salesStats.year_breakdown.revenue_eur.avondeten,
                  )}`}
                />
                <FinanceStatCard
                  label="Uitgaven dit jaar"
                  value={formatEUR(salesStats.year_expenses_eur)}
                  tone="slate"
                  hint={`Lunchkraam ${formatEUR(salesStats.year_breakdown.expenses_eur.lunchkraam)} · Avondeten ${formatEUR(
                    salesStats.year_breakdown.expenses_eur.avondeten,
                  )}`}
                />
                <FinanceStatCard
                  label="Saldo (omzet − uitgaven)"
                  value={formatEUR(salesStats.year_net_eur)}
                  tone={salesStats.year_net_eur >= 0 ? 'emerald' : 'amber'}
                />
                <FinanceStatCard
                  label="Omzet per kaart"
                  value={
                    salesStats.year_breakdown.cards_sold.total > 0
                      ? formatEUR(salesStats.year_breakdown.revenue_eur.total / salesStats.year_breakdown.cards_sold.total)
                      : formatEUR(0)
                  }
                  tone="default"
                />
              </div>
              <div className="surface-card overflow-x-auto">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Per maand</h4>
                <table className="mt-3 w-full min-w-[24rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Maand</th>
                      <th className="py-2 pr-4">Omzet</th>
                      <th className="py-2 pr-4">Uitgaven</th>
                      <th className="py-2">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesStats.monthly.map((m) => (
                      <tr key={m.month} className="border-b border-slate-100">
                        <td className="py-2.5 pr-4 text-slate-800">{m.label_nl}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-slate-900">{formatEUR(m.revenue_eur)}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-slate-700">{formatEUR(m.expenses_eur)}</td>
                        <td className="py-2.5 tabular-nums text-slate-900">{formatEUR(m.net_eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {year !== null && (statsLoading || salesStats) ? (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Verkochte tosti’s ({year})</h3>
          <p className="text-sm text-slate-600">Geteld op levermoment (kalenderjaar Amsterdam).</p>
          {statsLoading && !salesStats ? (
            <p className="text-sm text-slate-600">Laden…</p>
          ) : salesStats ? (
            <>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                Totaal dit jaar: {salesStats.year_tosti_quantity}{' '}
                {salesStats.year_tosti_quantity === 1 ? 'tosti' : 'tosti’s'}
              </p>
              <div className="surface-card overflow-x-auto">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Per maand</h4>
                <table className="mt-3 w-full min-w-[16rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Maand</th>
                      <th className="py-2">Aantal tosti’s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tostiRowsByMonth.map((row) => (
                      <tr key={row.month} className="border-b border-slate-100">
                        <td className="py-2.5 pr-4 text-slate-800">{row.label}</td>
                        <td className="py-2.5 tabular-nums text-slate-900">{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="surface-card overflow-x-auto">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Per soort</h4>
                <table className="mt-3 w-full min-w-[20rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Brood</th>
                      <th className="py-2 pr-4">Vulling</th>
                      <th className="py-2">Aantal</th>
                      {salesStats.year_tosti_quantity > 0 ? (
                        <th className="py-2 text-right">%</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {salesStats.tosti_by_kind.length === 0 ? (
                      <tr>
                        <td
                          colSpan={salesStats.year_tosti_quantity > 0 ? 4 : 3}
                          className="py-6 text-center text-slate-600"
                        >
                          Geen geleverde tosti’s in dit jaar.
                        </td>
                      </tr>
                    ) : (
                      salesStats.tosti_by_kind.map((row, idx) => (
                        <tr key={`${row.bread}-${row.filling}-${idx}`} className="border-b border-slate-100">
                          <td className="py-2.5 pr-4 text-slate-800">{breadLabel(row.bread)}</td>
                          <td className="py-2.5 pr-4 text-slate-800">{fillingLabel(row.filling)}</td>
                          <td className="py-2.5 tabular-nums text-slate-900">{row.quantity}</td>
                          {salesStats.year_tosti_quantity > 0 ? (
                            <td className="py-2.5 text-right tabular-nums text-slate-600">
                              {((100 * row.quantity) / salesStats.year_tosti_quantity).toFixed(1)}%
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

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
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={submitting || year === null} className="btn-primary min-h-11 px-5">
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
