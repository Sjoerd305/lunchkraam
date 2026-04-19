import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import type { FinanceControlMonthStatus } from '../../api/types'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useAdminSalesYearsSelect } from '../../hooks/useAdminSalesYearsSelect'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { adminYearSelectOptions } from '../../utils/adminYearSelectOptions'
import { formatEUR } from '../../utils/formatMoney'

function statusBadgeClasses(status: FinanceControlMonthStatus): string {
  switch (status) {
    case 'no_activity':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    case 'in_sync':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    case 'revolut_imports_higher':
      return 'border-amber-200 bg-amber-50 text-amber-950'
    case 'app_revenue_higher':
      return 'border-sky-200 bg-sky-50 text-sky-950'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function statusLabelNl(status: FinanceControlMonthStatus): string {
  switch (status) {
    case 'no_activity':
      return '—'
    case 'in_sync':
      return 'Synchroon'
    case 'revolut_imports_higher':
      return 'Revolut hoger'
    case 'app_revenue_higher':
      return 'App hoger'
    default:
      return '—'
  }
}

export function AdminFinanceControlPage() {
  const { user } = useAuth()
  const { alert } = useAlertDialog()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const { yearsQuery, year, setYear } = useAdminSalesYearsSelect({
    isOperatorOnly,
    enabled: Boolean(user),
    onYearsError: (msg) => void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' }),
  })

  const controlQuery = useQuery({
    queryKey: queryKeys.admin.financeControl(year ?? 0, isOperatorOnly),
    queryFn: () =>
      isOperatorOnly ? api.getOperatorFinanceControl(year!) : api.getAdminFinanceControl(year!),
    enabled: year !== null && Boolean(user),
  })

  useQueryErrorAlert(controlQuery, { title: 'Verkoopcontrole laden mislukt', alert })

  const payload = controlQuery.data ?? null
  const yearsLoading = yearsQuery.isLoading
  const tableLoading = controlQuery.isFetching

  const yearOptions = useMemo(
    () => adminYearSelectOptions(yearsQuery.data, year),
    [yearsQuery.data, year],
  )

  return (
    <div className="space-y-8">
      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Verkoopcontrole</h2>
        <p className="text-sm text-slate-600">
          Vergelijking per kalendermaand: <strong className="font-semibold text-slate-800">som geïmporteerde Revolut-regels</strong>{' '}
          (ontvangstdatum) tegen <strong className="font-semibold text-slate-800">app-omzet</strong> zoals elders in de
          rapportage (vervulde verkopen + open bankregels). Optioneel telt de tabel{' '}
          <strong className="font-semibold text-slate-800">overige correcties</strong> (Financiën) mee bij “app incl.”
          en de tweede delta/status. Dit volgt hetzelfde teken als{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">revolut-import reconcile</code> voor de eerste
          delta (Revolut − app). Afwijkingen zijn vaak timing: import in één maand, accordering in een andere.
        </p>
        <p className="text-sm text-slate-600">
          <Link to="/admin/finance" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Terug naar Financiën
          </Link>
          {' · '}
          <Link to="/admin/expenses-overview" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Jaaroverzichten
          </Link>
        </p>
      </section>

      <section className="surface-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Jaar</h3>
          {yearsLoading ? (
            <span className="text-sm text-slate-500">Laden…</span>
          ) : year !== null ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="select-control min-h-10 max-w-xs"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="surface-card space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Legenda</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-xl border px-3 py-2 text-sm ${statusBadgeClasses('in_sync')}`}>
            <p className="font-semibold">Synchroon</p>
            <p className="mt-1 text-xs opacity-90">Verschil kleiner dan €0,01.</p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-sm ${statusBadgeClasses('revolut_imports_higher')}`}>
            <p className="font-semibold">Revolut hoger</p>
            <p className="mt-1 text-xs opacity-90">Meer geïmporteerd deze maand dan de app-omzet voor die maand.</p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-sm ${statusBadgeClasses('app_revenue_higher')}`}>
            <p className="font-semibold">App hoger</p>
            <p className="mt-1 text-xs opacity-90">App-omzet in de maand ligt boven de som Revolut-importregels (zelfde maand).</p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-sm ${statusBadgeClasses('no_activity')}`}>
            <p className="font-semibold">Geen activiteit</p>
            <p className="mt-1 text-xs opacity-90">Geen import en geen omzet in die maand.</p>
          </div>
        </div>
      </section>

      {year !== null ? (
        <section className="surface-card space-y-3 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-800">Maandtabel ({year})</h3>
          {tableLoading && !payload ? (
            <p className="text-sm text-slate-600">Laden…</p>
          ) : payload ? (
            <>
              <table className="min-w-[58rem] w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Maand</th>
                    <th className="py-2 pr-3 text-right">Revolut</th>
                    <th className="py-2 pr-3 text-right">App</th>
                    <th className="py-2 pr-3 text-right">Correcties</th>
                    <th className="py-2 pr-3 text-right">App incl.</th>
                    <th className="py-2 pr-3 text-right">Δ</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Δ incl.</th>
                    <th className="py-2">St. incl.</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.months.map((row) => (
                    <tr key={row.month} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {row.label_nl}
                        <span className="ml-1 text-xs font-normal text-slate-500">({row.month})</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {formatEUR(row.revolut_imports_eur)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {formatEUR(row.app_revenue_eur)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {formatEUR(row.corrections_eur)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {formatEUR(row.app_incl_corrections_eur)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">{formatEUR(row.delta_eur)}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-semibold ${statusBadgeClasses(row.status)}`}
                        >
                          {statusLabelNl(row.status)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                        {formatEUR(row.delta_incl_corrections_eur)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-semibold ${statusBadgeClasses(row.status_incl_corrections)}`}
                        >
                          {statusLabelNl(row.status_incl_corrections)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payload.method_note_nl ? (
                <p className="text-xs leading-relaxed text-slate-500">{payload.method_note_nl}</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
