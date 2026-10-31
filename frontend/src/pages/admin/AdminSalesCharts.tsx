import { useMemo, useState } from 'react'
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
import type * as api from '../../api'
import { formatEUR, roundCents } from '../../utils/formatMoney'

const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

type Granularity = 'month' | 'quarter'

type ChartRow = {
  name: string
  kaarten: number
  kaartenTosti: number
  kaartenAvondeten: number
  omzet: number
  omzetVerkocht: number
  omzetBank: number
  omzetTosti: number
  omzetAvondeten: number
  uitgaven: number
  uitgavenLunchkraam: number
  uitgavenAvondeten: number
  netto: number
  cumulatief: number
  cumulatiefNet: number
}

function monthlyRows(stats: api.AdminSalesStats): ChartRow[] {
  const monthly = stats.monthly
  const breakdownByMonth = new Map(stats.monthly_breakdown.map((x) => [x.month, x]))
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
              revenue_card_sales_eur: 0,
              revenue_bank_unmatched_eur: 0,
              expenses_eur: 0,
              net_eur: 0,
              label_nl: MONTH_SHORT[i] ?? String(m),
            }
          )
        })
  let cumRev = 0
  let cumNet = 0
  return ordered.map((x) => {
    const breakdown = breakdownByMonth.get(x.month)
    const omzet = roundCents(x.revenue_eur)
    const uitgaven = roundCents(x.expenses_eur)
    const netto = roundCents(x.net_eur)
    cumRev += omzet
    cumNet += netto
    return {
      name: x.label_nl || MONTH_SHORT[x.month - 1] || `M${x.month}`,
      kaarten: x.fulfilled_count,
      kaartenTosti: breakdown?.cards_sold.tosti ?? 0,
      kaartenAvondeten: breakdown?.cards_sold.avondeten ?? 0,
      omzet,
      omzetVerkocht: roundCents(x.revenue_card_sales_eur),
      omzetBank: roundCents(x.revenue_bank_unmatched_eur),
      omzetTosti: roundCents(breakdown?.revenue_eur.tosti ?? 0),
      omzetAvondeten: roundCents(breakdown?.revenue_eur.avondeten ?? 0),
      uitgaven,
      uitgavenLunchkraam: roundCents(breakdown?.expenses_eur.lunchkraam ?? 0),
      uitgavenAvondeten: roundCents(breakdown?.expenses_eur.avondeten ?? 0),
      netto,
      cumulatief: roundCents(cumRev),
      cumulatiefNet: roundCents(cumNet),
    }
  })
}

const SUM_KEYS = [
  'kaarten',
  'kaartenTosti',
  'kaartenAvondeten',
  'omzet',
  'omzetVerkocht',
  'omzetBank',
  'omzetTosti',
  'omzetAvondeten',
  'uitgaven',
  'uitgavenLunchkraam',
  'uitgavenAvondeten',
  'netto',
] as const

function quarterlyRows(stats: api.AdminSalesStats): ChartRow[] {
  const m = monthlyRows(stats)
  const chunks: { name: string; range: number[] }[] = [
    { name: 'Q1', range: [0, 1, 2] },
    { name: 'Q2', range: [3, 4, 5] },
    { name: 'Q3', range: [6, 7, 8] },
    { name: 'Q4', range: [9, 10, 11] },
  ]
  let cumRev = 0
  let cumNet = 0
  return chunks.map(({ name, range }) => {
    const sums = Object.fromEntries(
      SUM_KEYS.map((key) => [key, roundCents(range.reduce((acc, i) => acc + (m[i]?.[key] ?? 0), 0))]),
    ) as Record<(typeof SUM_KEYS)[number], number>
    cumRev += sums.omzet
    cumNet += sums.netto
    return { name, ...sums, cumulatief: roundCents(cumRev), cumulatiefNet: roundCents(cumNet) }
  })
}

function PeriodFinanceTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{p.name}</p>
      <p className="text-slate-600">Omzet tosti: {formatEUR(p.omzetTosti)}</p>
      <p className="text-slate-600">Omzet avondeten: {formatEUR(p.omzetAvondeten)}</p>
      <p className="text-slate-600">Omzet totaal: {formatEUR(p.omzet)}</p>
      <p className="text-slate-600">— waarvan verkocht (app): {formatEUR(p.omzetVerkocht)}</p>
      <p className="text-slate-600">— bank nog niet gekoppeld: {formatEUR(p.omzetBank)}</p>
      <p className="text-slate-600">Uitgaven lunchkraam: {formatEUR(p.uitgavenLunchkraam)}</p>
      <p className="text-slate-600">Uitgaven avondeten: {formatEUR(p.uitgavenAvondeten)}</p>
      <p className="text-slate-600">Uitgaven totaal: {formatEUR(p.uitgaven)}</p>
      <p className="text-slate-600">Netto: {formatEUR(p.netto)}</p>
      <p className="text-slate-600">
        Kaarten: {p.kaartenTosti} tosti · {p.kaartenAvondeten} avondeten
      </p>
    </div>
  )
}

function CumFinanceTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
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

/** Grafieken voor één jaar; de data en de jaarkeuze komen van de overzichtspagina. */
export function AdminSalesCharts({ stats }: { stats: api.AdminSalesStats }) {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const chartData = useMemo(
    () => (granularity === 'month' ? monthlyRows(stats) : quarterlyRows(stats)),
    [stats, granularity],
  )

  return (
    <section className="space-y-4" aria-label="Omzet en uitgaven grafieken">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Grafieken ({stats.year})</h3>
        <div className="flex rounded-lg border border-slate-300 p-0.5 shadow-sm">
          {(
            [
              ['month', 'Per maand'],
              ['quarter', 'Per kwartaal'],
            ] as const
          ).map(([g, label]) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                granularity === g ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-1 px-1 text-sm font-semibold text-slate-800">Omzet en uitgaven per periode</h4>
          <p className="mb-3 px-1 text-xs text-slate-500">EUR per maand of kwartaal</p>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-slate-600"
                  tickFormatter={(v) => formatEUR(roundCents(Number(v)))}
                  width={44}
                />
                <Tooltip content={<PeriodFinanceTooltip />} cursor={{ fill: 'rgba(11, 33, 84, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="omzetTosti" name="Omzet tosti" stackId="omzet" fill="#0b2154" radius={[4, 4, 0, 0]} />
                <Bar dataKey="omzetAvondeten" name="Omzet avondeten" stackId="omzet" fill="#5c7eb8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="uitgavenLunchkraam" name="Uitgaven lunchkraam" stackId="uitgaven" fill="#e11d48" radius={[4, 4, 0, 0]} />
                <Bar dataKey="uitgavenAvondeten" name="Uitgaven avondeten" stackId="uitgaven" fill="#fb7185" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-1 px-1 text-sm font-semibold text-slate-800">Cumulatief</h4>
          <p className="mb-3 px-1 text-xs text-slate-500">Lopend over {stats.year}</p>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-slate-600" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-slate-600"
                  tickFormatter={(v) => formatEUR(roundCents(Number(v)))}
                  width={44}
                />
                <Tooltip content={<CumFinanceTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="cumulatief" name="Cumulatieve omzet" stroke="#334155" strokeWidth={2} dot={{ r: 3, fill: '#334155' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="cumulatiefNet" name="Cumulatief saldo" stroke="#6d28d9" strokeWidth={2} dot={{ r: 3, fill: '#6d28d9' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}
