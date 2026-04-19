import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { useAlertDialog } from '../../components/useAlertDialog'
import { queryKeys } from '../../queryKeys'
import { formatEUR } from '../../utils/formatMoney'
const AdminSalesCharts = lazy(async () => {
  const m = await import('./AdminSalesCharts')
  return { default: m.AdminSalesCharts }
})

function parseEurPerCard(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
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
    <div className={`rounded-2xl border p-5 shadow-sm ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-sm text-slate-600">{hint}</p> : null}
    </div>
  )
}

export function AdminDashboardPage() {
  const { alert } = useAlertDialog()
  const q = useQuery({
    queryKey: queryKeys.admin.dashboard,
    queryFn: () => api.getAdminDashboard(),
  })

  useEffect(() => {
    if (!q.isError || !q.error) return
    const msg = q.error instanceof api.ApiError ? q.error.message : 'Laden mislukt.'
    void alert({ title: 'Overzicht laden mislukt', message: msg, variant: 'error' })
  }, [q.isError, q.error, alert])

  if (q.isPending && !q.data) {
    return <p className="text-slate-600">Cijfers laden…</p>
  }

  if (q.isError && !q.data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Het overzicht kon niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  const stats = q.data
  if (!stats) {
    return null
  }

  const eur = parseEurPerCard(stats.payment_amount_eur)
  const openstaandEur = stats.pending_requests * eur
  const orphanRequestCount = stats.pending_requests - stats.pending_with_card

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Inkomsten vs. boodschappen ({stats.finance_year})
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          <Link to="/admin/finance" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Omzet afstemmen (Revolut)
          </Link>
          {' · '}
          <Link to="/admin/expenses" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Boodschappen beheren
          </Link>
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Rapport-omzet telt <strong className="font-semibold text-slate-800">verkochte kaarten</strong> plus{' '}
          <strong className="font-semibold text-slate-800">Revolut-regels die nog niet</strong> aan een verkoop zijn
          gekoppeld — geen dubbele Tikkie+Revolut zolang je bankregels afstemt.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Omzet dit jaar (rapport)"
            value={formatEUR(stats.year_revenue_eur)}
            tone="brand"
            hint="Kaartverkopen + nog niet gekoppelde bank"
          />
          <StatCard
            label="Verkocht (app)"
            value={formatEUR(stats.year_revenue_card_sales_eur)}
            tone="slate"
            hint="Geaccordeerde kaartverkopen"
          />
          <StatCard
            label="Bank nog niet gekoppeld"
            value={formatEUR(stats.year_revenue_bank_unmatched_eur)}
            tone="amber"
            hint={
              stats.year_bank_credits_unmatched_count > 0
                ? `${stats.year_bank_credits_unmatched_count} openstaande Revolut-regel(s) dit jaar`
                : 'Geen openstaande Revolut-regels'
            }
          />
          <StatCard
            label="Uitgaven dit jaar"
            value={formatEUR(stats.year_expenses_eur)}
            tone="slate"
          />
          <StatCard
            label="Saldo (omzet − uitgaven)"
            value={formatEUR(stats.year_net_eur)}
            tone={stats.year_net_eur >= 0 ? 'brand' : 'amber'}
          />
        </div>
      </section>

      <Suspense
        fallback={<p className="text-sm text-slate-600">Grafieken laden…</p>}
      >
        <AdminSalesCharts />
      </Suspense>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Kaarten &amp; knipjes (totaal)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Kaarten actief in omloop" value={stats.active_cards_total} />
          <StatCard
            label="Totaal knipjes nog open"
            value={stats.knipjes_remaining_total}
            tone="brand"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Nog niet geaccordeerd (wachtrij betaling)
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Knipjes kunnen al gebruikt zijn vóór accordering van de betaling.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Openstaande aanvragen"
            value={stats.pending_requests}
            hint={
              eur > 0
                ? `Ca. ${formatEUR(openstaandEur)} open (à ${formatEUR(eur)} per kaart).`
                : 'Geen kaartprijs ingesteld — geen euro-indicatie.'
            }
            tone="amber"
          />
          <StatCard
            label="Knipjes nog op niet-geaccordeerde kaarten"
            value={stats.pending_knipjes_remaining}
            tone="amber"
          />
          <StatCard
            label="Knipjes al gebruikt vóór accordering (schatting)"
            value={stats.pending_knipjes_consumed_estimate}
            hint="Schatting; uitgaande van 10 knipjes per kaart bij afgifte."
            tone="amber"
          />
        </div>
        {orphanRequestCount !== 0 ? (
          <p className="mt-3 text-sm text-amber-900/90">
            {orphanRequestCount}{' '}
            {orphanRequestCount === 1 ? 'aanvraag zonder' : 'aanvragen zonder'} gekoppelde kaart (niet in de tellers
            hierboven).
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Na accordering (gecontroleerde verkopen)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Aantal geaccordeerde verkopen"
            value={stats.fulfilled_requests}
            tone="slate"
          />
          <StatCard
            label="Knipjes nog open op geaccordeerde kaarten"
            value={stats.fulfilled_knipjes_remaining}
            tone="brand"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Overig</h2>
        <StatCard label="Geannuleerde aanvragen (historisch)" value={stats.cancelled_requests} />
      </section>
    </div>
  )
}
