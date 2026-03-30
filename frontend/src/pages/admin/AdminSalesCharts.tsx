import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  uitgaven: number
  netto: number
  cumulatief: number
  cumulatiefNet: number
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
              expenses_eur: 0,
              net_eur: 0,
              label_nl: MONTH_SHORT[i] ?? String(m),
            }
          )
        })
  let cumRev = 0
  let cumNet = 0
  return ordered.map((x) => {
    const omzet = Math.round(x.revenue_eur * 100) / 100
    const uitgaven = Math.round(x.expenses_eur * 100) / 100
    const netto = Math.round(x.net_eur * 100) / 100
    cumRev += omzet
    cumNet += netto
    return {
      name: x.label_nl || MONTH_SHORT[x.month - 1] || `M${x.month}`,
      kaarten: x.fulfilled_count,
      omzet,
      uitgaven,
      netto,
      cumulatief: Math.round(cumRev * 100) / 100,
      cumulatiefNet: Math.round(cumNet * 100) / 100,
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
  let cumRev = 0
  let cumNet = 0
  return chunks.map(({ name, range }) => {
    let kaarten = 0
    let omzet = 0
    let uitgaven = 0
    let netto = 0
    for (const i of range) {
      kaarten += m[i]?.kaarten ?? 0
      omzet += m[i]?.omzet ?? 0
      uitgaven += m[i]?.uitgaven ?? 0
      netto += m[i]?.netto ?? 0
    }
    omzet = Math.round(omzet * 100) / 100
    uitgaven = Math.round(uitgaven * 100) / 100
    netto = Math.round(netto * 100) / 100
    cumRev += omzet
    cumNet += netto
    return {
      name,
      kaarten,
      omzet,
      uitgaven,
      netto,
      cumulatief: Math.round(cumRev * 100) / 100,
      cumulatiefNet: Math.round(cumNet * 100) / 100,
    }
  })
}

function PeriodFinanceTooltip({
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
      <p className="text-slate-600">Uitgaven: {formatEUR(p.uitgaven)}</p>
      <p className="text-slate-600">Netto: {formatEUR(p.netto)}</p>
      <p className="text-slate-600">Kaarten: {p.kaarten}</p>
    </div>
  )
}

function CumFinanceTooltip({
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
      <p className="text-slate-600">Cumulatieve omzet: {formatEUR(p.cumulatief)}</p>
      <p className="text-slate-600">Cumulatief saldo: {formatEUR(p.cumulatiefNet)}</p>
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
        const yNow = new Date().getFullYear()
        setYear((prev) => {
          if (ys.length > 0) {
            if (prev !== null && ys.includes(prev)) return prev
            return ys[0] ?? yNow
          }
          return prev ?? yNow
        })
      } catch (e) {
        setAvailableYears([])
        setYear(new Date().getFullYear())
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
        void alert({ title: 'Cijfers laden mislukt', message: msg, variant: 'error' })
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

  const yearSelectOptions = useMemo(() => {
    const yNow = new Date().getFullYear()
    const base = availableYears.length > 0 ? [...availableYears] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [availableYears, year])

  const hasFinanceData =
    stats !== null && (stats.year_fulfilled_count > 0 || stats.year_expenses_eur > 0)

  return (
    <section className="space-y-4" aria-label="Omzet en uitgaven grafieken">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Omzet en boodschappen</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Omzet is de som van de prijs die bij accordering is opgeslagen per kaart. Uitgaven zijn handmatig
            geboekte boodschappen (zelfde kalenderjaar als de boekingsdatum). Verkopen: maanden volgens tijdzone{' '}
            {stats?.timezone ?? 'Europe/Amsterdam'}. Huidige catalogusprijs voor nieuwe verkopen:{' '}
            {stats ? `€${stats.payment_amount_eur}` : '…'}.
          </p>
        </div>
        {year !== null && yearSelectOptions.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap font-medium">Jaar</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={yearsLoading}
                className="select-control min-h-10"
              >
                {yearSelectOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
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
      ) : statsLoading && !stats ? (
        <p className="text-sm text-slate-600">Grafieken laden…</p>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kaarten {stats.year}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                {stats.year_fulfilled_count}
              </p>
              <p className="mt-1 text-sm text-slate-600">geaccordeerde verkopen</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Omzet</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-950">
                {formatEUR(stats.year_revenue_eur)}
              </p>
              <p className="mt-1 text-sm text-emerald-900/80">
                {stats.year_fulfilled_count === 0
                  ? 'Nog geen verkopen dit jaar.'
                  : `Gem. €${(stats.year_revenue_eur / stats.year_fulfilled_count).toFixed(2)} per kaart (historisch tarief per transactie).`}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-900">Uitgaven</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-rose-950">
                {formatEUR(stats.year_expenses_eur)}
              </p>
              <p className="mt-1 text-sm text-rose-900/80">Geboekte boodschappen</p>
            </div>
            <div
              className={`rounded-2xl border p-5 shadow-sm ${
                stats.year_net_eur >= 0
                  ? 'border-violet-200 bg-violet-50/80'
                  : 'border-amber-200 bg-amber-50/80'
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  stats.year_net_eur >= 0 ? 'text-violet-900' : 'text-amber-900'
                }`}
              >
                Saldo
              </p>
              <p
                className={`mt-2 text-3xl font-bold tabular-nums ${
                  stats.year_net_eur >= 0 ? 'text-violet-950' : 'text-amber-950'
                }`}
              >
                {formatEUR(stats.year_net_eur)}
              </p>
              <p className="mt-1 text-sm text-slate-700">Omzet min uitgaven</p>
            </div>
          </div>

          {!hasFinanceData ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              Geen omzet of uitgaven voor {stats.year}. Accordeer betalingen of{' '}
              <Link to="/admin/expenses" className="font-semibold text-brand-800 underline">
                boek een boodschap
              </Link>{' '}
              om hier grafieken te zien.
            </p>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 px-1 text-sm font-semibold text-slate-800">Omzet en uitgaven per periode</h3>
                <p className="mb-3 px-1 text-xs text-slate-500">EUR per maand of kwartaal</p>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-slate-600"
                        tickFormatter={(v) => `€${v}`}
                        width={44}
                      />
                      <Tooltip
                        content={<PeriodFinanceTooltip />}
                        cursor={{ fill: 'rgba(15, 118, 110, 0.06)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="omzet" name="Omzet" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="uitgaven" name="Uitgaven" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 px-1 text-sm font-semibold text-slate-800">Cumulatief</h3>
                <p className="mb-3 px-1 text-xs text-slate-500">
                  Lopende omzet en saldo (omzet − uitgaven) over {stats.year}
                </p>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-slate-600"
                        tickFormatter={(v) => `€${v}`}
                        width={44}
                      />
                      <Tooltip content={<CumFinanceTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="cumulatief"
                        name="Cumulatieve omzet"
                        stroke="#334155"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#334155' }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulatiefNet"
                        name="Cumulatief saldo"
                        stroke="#6d28d9"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#6d28d9' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Omzet per periode is de som van de prijzen die bij accordering zijn vastgelegd. Uitgaven boek je onder{' '}
            <strong>Boodschappen</strong>.
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
