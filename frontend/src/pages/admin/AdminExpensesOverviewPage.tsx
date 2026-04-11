import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'

function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function breadLabel(b: string): string {
  return b === 'bruin' ? 'Bruin brood' : 'Wit brood'
}

function fillingLabel(f: string): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
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
  tone?: 'default' | 'amber' | 'brand' | 'slate'
}) {
  const ring =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/80'
      : tone === 'brand'
        ? 'border-brand-200 bg-brand-50/80'
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

export function AdminExpensesOverviewPage() {
  const { user } = useAuth()
  const { alert } = useAlertDialog()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [yearsLoading, setYearsLoading] = useState(true)
  const [salesStats, setSalesStats] = useState<api.AdminSalesStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    void (async () => {
      setYearsLoading(true)
      try {
        const ys = isOperatorOnly ? await api.getOperatorSalesYears() : await api.getAdminSalesYears()
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

  const loadStats = useCallback(
    async (y: number) => {
      setStatsLoading(true)
      try {
        const s = isOperatorOnly ? await api.getOperatorSalesStats(y) : await api.getAdminSalesStats(y)
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
    void loadStats(year)
  }, [year, loadStats])

  const tostiRowsByMonth = useMemo(() => {
    if (!salesStats) return []
    const qtyByMonth = new Map(salesStats.tosti_monthly.map((t) => [t.month, t.quantity]))
    return salesStats.monthly.map((fin) => ({
      label: fin.label_nl,
      month: fin.month,
      quantity: qtyByMonth.get(fin.month) ?? 0,
    }))
  }, [salesStats])

  const yearOptions = useMemo(() => {
    const yNow = new Date().getFullYear()
    const base = years.length > 0 ? [...years] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [years, year])

  return (
    <div className="space-y-8">
      <section className="surface-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Overzichten</h3>
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
      </section>

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
                  tone="brand"
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
                  tone={salesStats.year_net_eur >= 0 ? 'brand' : 'amber'}
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
                      {salesStats.year_tosti_quantity > 0 ? <th className="py-2 text-right">%</th> : null}
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
    </div>
  )
}
