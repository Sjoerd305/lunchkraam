import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { useAlertDialog } from '../../components/AlertDialogProvider'
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
    <div className={`rounded-2xl border p-5 shadow-sm ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-sm text-slate-600">{hint}</p> : null}
    </div>
  )
}

export function AdminDashboardPage() {
  const { alert } = useAlertDialog()
  const [stats, setStats] = useState<api.AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const s = await api.getAdminDashboard()
      setStats(s)
    } catch (e) {
      setFailed(true)
      setStats(null)
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Overzicht laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !stats) {
    return <p className="text-slate-600">Cijfers laden…</p>
  }

  if (failed && !stats) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Het overzicht kon niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

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
          <Link to="/admin/expenses" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Boodschappen beheren
          </Link>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Omzet dit jaar"
            value={`€${stats.year_revenue_eur.toFixed(2)}`}
            tone="emerald"
          />
          <StatCard
            label="Uitgaven dit jaar"
            value={`€${stats.year_expenses_eur.toFixed(2)}`}
            tone="slate"
          />
          <StatCard
            label="Saldo (omzet − uitgaven)"
            value={`€${stats.year_net_eur.toFixed(2)}`}
            tone={stats.year_net_eur >= 0 ? 'emerald' : 'amber'}
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
            tone="emerald"
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
                ? `Ca. €${openstaandEur.toFixed(2)} open (à €${stats.payment_amount_eur} per kaart).`
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
            tone="emerald"
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
