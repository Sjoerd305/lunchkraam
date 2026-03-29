import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as api from '../../api'
import { useAlertDialog } from '../../components/AlertDialogProvider'

const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

type Granularity = 'month' | 'quarter'

type ChartRow = {
  name: string
  kaarten: number
  omzet: number
  cumulatief: number
}

function monthlyRows(monthly: api.AdminSalesMonthBucket[]): ChartRow[] {
  const ordered =
    monthly.length === 12
      ? monthly
      : Array.from({ length: 12 }, (_, i) => {
          const m = i + 1
          const hit = monthly.find((x) => x.month === m)
          return (
            hit ?? {
              month: m,
              fulfilled_count: 0,
              revenue_eur: 0,
              label_nl: MONTH_SHORT[i] ?? String(m),
            }
          )
        })
  let cum = 0
  return ordered.map((x) => {
    cum += x.revenue_eur
    return {
      name: x.label_nl || MONTH_SHORT[x.month - 1] || `M${x.month}`,
      kaarten: x.fulfilled_count,
      omzet: Math.round(x.revenue_eur * 100) / 100,
      cumulatief: Math.round(cum * 100) / 100,
    }
  })
}

function quarterlyRows(monthly: api.AdminSalesMonthBucket[]): ChartRow[] {
  const m = monthlyRows(monthly)
  const chunks: { name: string; range: number[] }[] = [
    { name: 'Q1', range: [0, 1, 2] },
    { name: 'Q2', range: [3, 4, 5] },
    { name: 'Q3', range: [6, 7, 8] },
    { name: 'Q4', range: [9, 10, 11] },
  ]
  let cum = 0
  return chunks.map(({ name, range }) => {
    let kaarten = 0
    let omzet = 0
    for (const i of range) {
      kaarten += m[i]?.kaarten ?? 0
      omzet += m[i]?.omzet ?? 0
    }
    omzet = Math.round(omzet * 100) / 100
    cum += omzet
    return {
      name,
      kaarten,
      omzet,
      cumulatief: Math.round(cum * 100) / 100,
    }
  })
}

function OmzetTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{p.name}</p>
      <p className="text-slate-600">Omzet: {formatEUR(p.omzet)}</p>
      <p className="text-slate-600">Kaarten: {p.kaarten}</p>
    </div>
  )
}

function CumTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{p.name}</p>
      <p className="text-slate-600">Cumulatief: {formatEUR(p.cumulatief)}</p>
    </div>
  )
}

export function AdminSalesCharts() {
  const { alert } = useAlertDialog()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [yearsLoading, setYearsLoading] = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [stats, setStats] = useState<api.AdminSalesStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      setYearsLoading(true)
      try {
        const ys = await api.getAdminSalesYears()
        setAvailableYears(ys)
        setYear((prev) => {
          if (prev !== null && ys.includes(prev)) return prev
          return ys[0] ?? null
        })
      } catch (e) {
        setAvailableYears([])
        setYear(null)
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' })
      } finally {
        setYearsLoading(false)
      }
    })()
  }, [alert])

  const loadStats = useCallback(
    async (y: number) => {
      setStatsLoading(true)
      try {
        const s = await api.getAdminSalesStats(y)
        setStats(s)
      } catch (e) {
        setStats(null)
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Verkoopcijfers laden mislukt', message: msg, variant: 'error' })
      } finally {
        setStatsLoading(false)
      }
    },
    [alert],
  )

  useEffect(() => {
    if (year === null) {
      setStats(null)
      return
    }
    void loadStats(year)
  }, [year, loadStats])

  const chartData = useMemo(() => {
    if (!stats?.monthly.length) return []
    return granularity === 'month' ? monthlyRows(stats.monthly) : quarterlyRows(stats.monthly)
  }, [stats, granularity])

  return (
    <section className="space-y-4" aria-label="Omzet grafieken geaccordeerde verkopen">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Omzet (geaccordeerde verkopen)</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Omzet is de som van de prijs die bij accordering is opgeslagen (wijzigingen in{' '}
            <code className="rounded bg-slate-100 px-1">PAYMENT_AMOUNT_EUR</code> beïnvloeden historische
            cijfers niet). Huidige catalogusprijs voor nieuwe verkopen:{' '}
            {stats ? `€${stats.payment_amount_eur}` : '…'}. Maanden volgens tijdzone{' '}
            {stats?.timezone ?? 'Europe/Amsterdam'}.
          </p>
        </div>
        {availableYears.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {year !== null ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <span className="whitespace-nowrap font-medium">Jaar</span>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  disabled={yearsLoading}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 shadow-sm disabled:opacity-60"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {statsLoading ? (
              <span className="text-xs font-medium text-slate-500">Bijwerken…</span>
            ) : null}
            <div className="flex rounded-lg border border-slate-300 p-0.5 shadow-sm">
              <button
                type="button"
                disabled={!stats}
                onClick={() => setGranularity('month')}
                className={`rounded-md px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                  granularity === 'month'
                    ? 'bg-brand-700 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Per maand
              </button>
              <button
                type="button"
                disabled={!stats}
                onClick={() => setGranularity('quarter')}
                className={`rounded-md px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                  granularity === 'quarter'
                    ? 'bg-brand-700 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Per kwartaal
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {yearsLoading ? (
        <p className="text-sm text-slate-600">Beschikbare jaren laden…</p>
      ) : availableYears.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Er zijn nog geen geaccordeerde verkopen. Zodra je betalingen accordeert, verschijnen hier de jaren en
          grafieken.
        </p>
      ) : statsLoading && !stats ? (
        <p className="text-sm text-slate-600">Grafieken laden…</p>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Totaal {stats.year} (geaccordeerd)
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                {stats.year_fulfilled_count}
              </p>
              <p className="mt-1 text-sm text-slate-600">kaarten</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Omzet {stats.year}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-950">
                {formatEUR(stats.year_revenue_eur)}
              </p>
              <p className="mt-1 text-sm text-emerald-900/80">
                {stats.year_fulfilled_count === 0
                  ? 'Nog geen geaccordeerde verkopen in dit jaar.'
                  : `Gemiddeld €${(stats.year_revenue_eur / stats.year_fulfilled_count).toFixed(2)} per geaccordeerde kaart (kan verschillen na tariefwijzigingen).`}
              </p>
            </div>
          </div>

          {stats.year_fulfilled_count === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              Geen gegevens voor {stats.year}. Zodra je betalingen accordeert, verschijnen de staven hier.
            </p>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 px-1 text-sm font-semibold text-slate-800">Omzet per periode</h3>
                <p className="mb-3 px-1 text-xs text-slate-500">Som van verkochte kaarten × tarief</p>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-slate-600"
                        tickFormatter={(v) => `€${v}`}
                        width={44}
                      />
                      <Tooltip content={<OmzetTooltip />} cursor={{ fill: 'rgba(15, 118, 110, 0.06)' }} />
                      <Bar dataKey="omzet" name="Omzet" fill="#0f766e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 px-1 text-sm font-semibold text-slate-800">Cumulatieve omzet</h3>
                <p className="mb-3 px-1 text-xs text-slate-500">Lopend totaal over {stats.year}</p>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-slate-600"
                        tickFormatter={(v) => `€${v}`}
                        width={44}
                      />
                      <Tooltip content={<CumTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="cumulatief"
                        name="Cumulatief"
                        stroke="#334155"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#334155' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Historische omzet gebruikt het <strong>huidige</strong> tarief uit de configuratie (hetzelfde als op de
            kooppagina), niet het tarief per transactie in de database.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-600">
          {year !== null ? `Kon de cijfers voor ${year} niet laden.` : null}
        </p>
      )}
    </section>
  )
}
