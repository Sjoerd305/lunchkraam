import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { useAlertDialog } from '../../components/AlertDialogProvider'

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

  return (
    <div className="space-y-8">
      <p className="text-slate-600">
        Stand van zorgplicht en voorraad aan knipjes. Cijfers komen rechtstreeks uit de database.
      </p>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Kaarten &amp; knipjes (totaal)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Kaarten actief in omloop"
            value={stats.active_cards_total}
            hint="Fysiek/logische kaarten met een saldo in het systeem."
          />
          <StatCard
            label="Totaal knipjes nog open"
            value={stats.knipjes_remaining_total}
            hint="Som van alle resterende knipjes op alle actieve kaarten (nog te verzilveren tosti’s)."
            tone="emerald"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Nog niet geaccordeerd (wachtrij betaling)
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Leden kunnen al knipjes gebruiken vóór jouw accordering. Hier zie je het risico / de &quot;fictieve
          min&quot;: lunches die al zijn verbruikt terwijl de betaling nog in de wachtrij staat.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Openstaande aanvragen"
            value={stats.pending_requests}
            hint={
              eur > 0
                ? `Indicatie openstaand bedrag: ca. €${openstaandEur.toFixed(2)} (à €${stats.payment_amount_eur} per kaart).`
                : 'Configureer PAYMENT_AMOUNT_EUR voor een bedrag-indicatie.'
            }
            tone="amber"
          />
          <StatCard
            label="Knipjes nog op niet-geaccordeerde kaarten"
            value={stats.pending_knipjes_remaining}
            hint="Nog te gebruiken knipjes op kaarten die aan een openstaande aanvraag hangen."
            tone="amber"
          />
          <StatCard
            label="Knipjes al gebruikt vóór accordering (schatting)"
            value={stats.pending_knipjes_consumed_estimate}
            hint="Som van (10 − resterend) per kaart in de wachtrij. Geldt als alle kaarten met 10 knipjes zijn gestart."
            tone="amber"
          />
        </div>
        {stats.pending_requests !== stats.pending_with_card ? (
          <p className="mt-3 text-sm text-amber-900/90">
            Let op: {stats.pending_requests - stats.pending_with_card} aanvra(a)g(en) zonder gekoppelde kaart
            (oude data of migratie); die tellen niet mee in de knipjes-kolommen hiernaast.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Na accordering (gecontroleerde verkopen)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Aantal geaccordeerde verkopen"
            value={stats.fulfilled_requests}
            hint="Historisch aantal aanvragen dat je als betaald hebt gemarkeerd."
            tone="slate"
          />
          <StatCard
            label="Knipjes nog open op geaccordeerde kaarten"
            value={stats.fulfilled_knipjes_remaining}
            hint="Huidige resterende capaciteit op kaarten die al door de wachtrij zijn."
            tone="emerald"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Overig</h2>
        <StatCard
          label="Geannuleerde aanvragen (historisch)"
          value={stats.cancelled_requests}
          hint="Teller in de database; geannuleerde kaarten worden verwijderd."
        />
      </section>

      <p className="text-xs text-slate-500">
        Schatting &quot;al gebruikt vóór accordering&quot; gaat uit van een startwaarde van 10 knipjes per kaart.
        Kaarten die ooit met minder knipjes zijn aangemaakt (legacy) kunnen hier licht afwijken.
      </p>
    </div>
  )
}
