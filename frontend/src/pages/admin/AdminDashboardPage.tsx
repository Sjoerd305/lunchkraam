import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useAdminSalesYearsSelect } from '../../hooks/useAdminSalesYearsSelect'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { adminYearSelectOptions } from '../../utils/adminYearSelectOptions'
import { formatEUR, formatEURFromString } from '../../utils/formatMoney'

const AdminSalesCharts = lazy(async () => {
  const m = await import('./AdminSalesCharts')
  return { default: m.AdminSalesCharts }
})

type Tone = 'default' | 'amber' | 'brand' | 'slate' | 'rose'

function StatCard({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: Tone }) {
  const ring =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/80'
      : tone === 'brand'
        ? 'border-brand-200 bg-brand-50/80'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50/80'
          : tone === 'slate'
            ? 'border-slate-200 bg-slate-50/80'
            : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-sm text-slate-600">{hint}</p> : null}
    </div>
  )
}

function breadText(b: string): string {
  return b === 'bruin' ? 'Bruin brood' : 'Wit brood'
}

function fillingText(f: string): string {
  if (f === 'kaas') return 'Kaas'
  if (f === 'ham_kaas') return 'Ham & kaas'
  return 'Ham'
}

/**
 * Eén financieel overzicht met jaarkeuze voor beheerders en kraammedewerkers.
 * Vervangt het oude admin-dashboard én "Overzichten".
 */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const { alert } = useAlertDialog()
  const isAdmin = Boolean(user?.is_admin)
  const isOperatorOnly = Boolean(user?.is_operator && !user?.is_admin)

  const { yearsQuery, year, setYear } = useAdminSalesYearsSelect({
    isOperatorOnly,
    enabled: Boolean(user),
    emptyYearsListBehavior: 'keepPreviousOrNow',
    onYearsError: (msg) => void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' }),
  })

  const statsQuery = useQuery({
    queryKey: queryKeys.admin.salesStats(year ?? 0, isOperatorOnly),
    queryFn: () => (isOperatorOnly ? api.getOperatorSalesStats(year!) : api.getAdminSalesStats(year!)),
    enabled: year !== null && Boolean(user),
  })
  useQueryErrorAlert(statsQuery, { title: 'Cijfers laden mislukt', alert })

  const dashQuery = useQuery({
    queryKey: queryKeys.admin.dashboard,
    queryFn: () => api.getAdminDashboard(),
    enabled: isAdmin,
  })
  useQueryErrorAlert(dashQuery, { title: 'Kaarttellers laden mislukt', alert })

  const stats = statsQuery.data ?? null
  const dash = dashQuery.data ?? null
  const yearOptions = useMemo(() => adminYearSelectOptions(yearsQuery.data, year), [yearsQuery.data, year])

  const tostiRowsByMonth = useMemo(() => {
    if (!stats) return []
    const qtyByMonth = new Map(stats.tosti_monthly.map((t) => [t.month, t.quantity]))
    return stats.monthly.map((fin) => ({ label: fin.label_nl, month: fin.month, quantity: qtyByMonth.get(fin.month) ?? 0 }))
  }, [stats])

  const hasFinanceData =
    stats !== null && (stats.year_fulfilled_count > 0 || stats.year_expenses_eur > 0 || stats.year_revenue_eur > 0)

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-slate-900">Overzicht</h2>
          <p className="mt-1 text-sm text-slate-600">
            Omzet = geaccordeerde kaartverkopen (prijs van dat moment) plus Revolut-bijschrijvingen die nog niet aan een
            verkoop zijn gekoppeld. Uitgaven = geboekte boodschappen. Tosti's geteld op levermoment (Europe/Amsterdam).{' '}
            <Link to="/admin/finance" className="font-semibold text-brand-800 underline hover:text-brand-950">
              Bankregels koppelen
            </Link>{' '}
            voorkomt dubbele telling.
          </p>
        </div>
        {yearsQuery.isLoading ? (
          <span className="text-sm text-slate-500">Jaren laden…</span>
        ) : year !== null ? (
          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-700">
            <span className="font-medium">Jaar</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="select-control min-h-10">
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {statsQuery.isFetching ? <span className="text-xs text-slate-500">Bijwerken…</span> : null}
          </label>
        ) : null}
      </section>

      {statsQuery.isPending && year !== null ? (
        <p className="text-sm text-slate-600">Cijfers laden…</p>
      ) : stats ? (
        <>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Financieel ({stats.year}) · catalogusprijs tostikaart {formatEURFromString(stats.payment_amount_eur)}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Kaarten verkocht"
                value={stats.year_breakdown.cards_sold.total}
                hint={`${stats.year_breakdown.cards_sold.tosti} tosti · ${stats.year_breakdown.cards_sold.avondeten} avondeten`}
              />
              <StatCard
                label="Omzet (rapport)"
                value={formatEUR(stats.year_revenue_eur)}
                tone="brand"
                hint={`Verkocht in app ${formatEUR(stats.year_revenue_card_sales_eur)} · bank nog niet gekoppeld ${formatEUR(
                  stats.year_revenue_bank_unmatched_eur,
                )}`}
              />
              <StatCard
                label="Uitgaven"
                value={formatEUR(stats.year_expenses_eur)}
                tone="rose"
                hint={`Lunchkraam ${formatEUR(stats.year_breakdown.expenses_eur.lunchkraam)} · Avondeten ${formatEUR(
                  stats.year_breakdown.expenses_eur.avondeten,
                )}. Contant bij kas telt negatief mee.`}
              />
              <StatCard
                label="Saldo"
                value={formatEUR(stats.year_net_eur)}
                tone={stats.year_net_eur >= 0 ? 'brand' : 'amber'}
                hint={
                  stats.year_breakdown.cards_sold.total > 0
                    ? `Omzet − uitgaven · gem. ${formatEUR(stats.year_revenue_eur / stats.year_breakdown.cards_sold.total)} per kaart`
                    : 'Omzet − uitgaven'
                }
              />
            </div>
            <p className="text-xs text-slate-500">
              Omzet per type: tosti {formatEUR(stats.year_breakdown.revenue_eur.tosti)} · avondeten{' '}
              {formatEUR(stats.year_breakdown.revenue_eur.avondeten)}.
            </p>
            {!hasFinanceData ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
                Nog geen verkopen of uitgaven in {stats.year}.{' '}
                <Link to="/admin/expenses" className="font-semibold text-brand-800 underline">
                  Boodschappen boeken
                </Link>
              </p>
            ) : (
              <Suspense fallback={<p className="text-sm text-slate-600">Grafieken laden…</p>}>
                <AdminSalesCharts stats={stats} />
              </Suspense>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="surface-card overflow-x-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financieel per maand</h4>
              <table className="mt-3 w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Maand</th>
                    <th className="py-2 pr-3">Kaarten</th>
                    <th className="py-2 pr-3">Omzet</th>
                    <th className="py-2 pr-3">App</th>
                    <th className="py-2 pr-3">Bank open</th>
                    <th className="py-2 pr-3">Uitgaven</th>
                    <th className="py-2">Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.monthly.map((m) => (
                    <tr key={m.month} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-800">{m.label_nl}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{m.fulfilled_count}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-900">{formatEUR(m.revenue_eur)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{formatEUR(m.revenue_card_sales_eur)}</td>
                      <td className="py-2 pr-3 tabular-nums text-amber-900/90">{formatEUR(m.revenue_bank_unmatched_eur)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{formatEUR(m.expenses_eur)}</td>
                      <td className="py-2 tabular-nums text-slate-900">{formatEUR(m.net_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-6">
              <div className="surface-card overflow-x-auto">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tosti's per maand</h4>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {stats.year_tosti_quantity} {stats.year_tosti_quantity === 1 ? 'tosti' : 'tosti’s'} in {stats.year}
                  </span>
                </div>
                <table className="mt-3 w-full min-w-[14rem] text-left text-sm">
                  <tbody>
                    {tostiRowsByMonth.map((row) => (
                      <tr key={row.month} className="border-b border-slate-100">
                        <td className="py-1.5 pr-4 text-slate-800">{row.label}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-900">{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="surface-card overflow-x-auto">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tosti's per soort</h4>
                <table className="mt-3 w-full min-w-[18rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Brood</th>
                      <th className="py-2 pr-4">Vulling</th>
                      <th className="py-2 text-right">Aantal</th>
                      <th className="py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tosti_by_kind.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-600">
                          Geen geleverde tosti's in dit jaar.
                        </td>
                      </tr>
                    ) : (
                      stats.tosti_by_kind.map((row, idx) => (
                        <tr key={`${row.bread}-${row.filling}-${idx}`} className="border-b border-slate-100">
                          <td className="py-1.5 pr-4 text-slate-800">{breadText(row.bread)}</td>
                          <td className="py-1.5 pr-4 text-slate-800">{fillingText(row.filling)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-900">{row.quantity}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-600">
                            {stats.year_tosti_quantity > 0
                              ? `${((100 * row.quantity) / stats.year_tosti_quantity).toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : statsQuery.isError ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Kon de cijfers voor {year} niet laden.{' '}
          <button type="button" onClick={() => void statsQuery.refetch()} className="font-semibold text-brand-800 underline">
            Opnieuw proberen
          </button>
        </p>
      ) : null}

      {isAdmin && dash ? (
        <section className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kaarten en knipjes (nu, alle jaren)</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Kaarten in omloop" value={dash.active_cards_total} />
              <StatCard label="Knipjes nog open" value={dash.knipjes_remaining_total} tone="brand" />
              <StatCard
                label="Betalingen in de wachtrij"
                value={dash.pending_requests}
                tone={dash.pending_requests > 0 ? 'amber' : 'default'}
                hint={
                  dash.pending_requests > 0
                    ? `Ca. ${formatEUR(
                        dash.pending_requests * parseFloat(dash.payment_amount_eur.replace(',', '.') || '0'),
                      )} open bij tostikaartprijs.`
                    : 'Niets te accorderen.'
                }
              />
              <StatCard
                label="Knipjes al gebruikt vóór accordering"
                value={dash.pending_knipjes_consumed_estimate}
                tone="amber"
                hint="Leden mogen direct bestellen; de betaling wordt achteraf gecontroleerd."
              />
            </div>
            {dash.pending_requests > 0 ? (
              <p className="mt-3 text-sm">
                <Link to="/kraam?tab=betalingen" className="font-semibold text-brand-800 underline">
                  Naar de betalingswachtrij op de kraampagina
                </Link>
              </p>
            ) : null}
            {dash.pending_requests - dash.pending_with_card !== 0 ? (
              <p className="mt-3 text-sm text-amber-900/90">
                {dash.pending_requests - dash.pending_with_card} aanvragen zonder gekoppelde kaart (niet in de tellers hierboven).
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Geaccordeerde verkopen (totaal)" value={dash.fulfilled_requests} tone="slate" />
            <StatCard label="Knipjes open op geaccordeerde kaarten" value={dash.fulfilled_knipjes_remaining} tone="slate" />
            <StatCard label="Geannuleerde aanvragen (historisch)" value={dash.cancelled_requests} tone="slate" />
          </div>
        </section>
      ) : null}
    </div>
  )
}
