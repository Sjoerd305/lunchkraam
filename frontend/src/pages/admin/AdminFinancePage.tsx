import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import type { DialogContextValue } from '../../components/alertDialogContext'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useAdminSalesYearsSelect } from '../../hooks/useAdminSalesYearsSelect'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { adminYearSelectOptions } from '../../utils/adminYearSelectOptions'
import { formatEUR } from '../../utils/formatMoney'

function formatFulfilledShort(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t))
}

function manualMatchOptionLabel(c: api.BankCreditSuggestionCandidate): string {
  const who = c.user_display?.trim() || c.user_email || 'Onbekend'
  return `#${c.card_request_id} · ${who} · ${formatEUR(c.sale_price_eur)} · ${formatFulfilledShort(c.fulfilled_at)}`
}

function purposeLabel(p: api.ShopExpensePurpose): string {
  return p === 'avondeten' ? 'Avondeten' : 'Lunchkraam / tosti'
}

function financeCorrectionKindLabel(kind: api.FinanceCorrectionKind): string {
  switch (kind) {
    case 'refund_outside_app':
      return 'Terugbetaling (buiten standaardpad)'
    case 'other_branch_guest':
      return 'Andere speltak / gast'
    case 'internal_settlement':
      return 'Interne verrekening'
    case 'other':
      return 'Overig'
    default:
      return kind
  }
}

type FinanceCorrectionsSectionProps = {
  year: number
  csrf: string
  alert: DialogContextValue['alert']
  confirm: DialogContextValue['confirm']
}

function FinanceCorrectionsSection({ year, csrf, alert, confirm }: FinanceCorrectionsSectionProps) {
  const queryClient = useQueryClient()
  const [recordedOn, setRecordedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [purpose, setPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [kind, setKind] = useState<api.FinanceCorrectionKind>('other')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const listQuery = useQuery({
    queryKey: queryKeys.admin.financeCorrections(year),
    queryFn: () => api.getAdminFinanceCorrections(year),
  })

  useQueryErrorAlert(listQuery, { title: 'Correcties laden mislukt', alert })

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.financeCorrections(year) })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance-control'] })
  }, [queryClient, year])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const raw = amount.trim().replace(',', '.')
    const n = Number(raw)
    if (!Number.isFinite(n) || n === 0) {
      void alert({ title: 'Ongeldig bedrag', message: 'Vul een bedrag in dat niet nul is (negatief mag).', variant: 'error' })
      return
    }
    setSubmitting(true)
    try {
      await api.postAdminFinanceCorrection(csrf, {
        recorded_on: recordedOn,
        purpose,
        kind,
        amount_eur: n,
        description: description.trim(),
      })
      void alert({ title: 'Opgeslagen', message: 'De correctie staat in de lijst en telt mee op Verkoopcontrole.', variant: 'success' })
      setAmount('')
      setDescription('')
      invalidate()
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      void alert({ title: 'Opslaan mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Correctie verwijderen',
      message: 'Deze regel verdwijnt uit rapportages en Verkoopcontrole.',
      confirmLabel: 'Verwijderen',
      cancelLabel: 'Annuleren',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(id)
    try {
      await api.deleteAdminFinanceCorrection(csrf, id)
      void alert({ title: 'Verwijderd', message: 'De correctie is weggehaald.', variant: 'success' })
      invalidate()
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      void alert({ title: 'Verwijderen mislukt', message: msg, variant: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  const rows = listQuery.data?.corrections ?? []

  return (
    <section className="surface-card space-y-4">
      <h3 className="text-sm font-semibold text-slate-800">Overige correcties</h3>
      <p className="text-sm text-slate-600">
        Voor situaties die <strong className="font-semibold text-slate-800">niet</strong> in uitgaven (Boodschappen) of
        “bank zonder verkoop” passen: terugbetalingen, andere speltak, interne verrekening. Dit is een administratieve
        aanpassing aan de <strong className="font-semibold text-slate-800">app-kant</strong> van de vergelijking op{' '}
        <Link to="/admin/finance-control" className="font-semibold text-brand-800 underline hover:text-brand-950">
          Verkoopcontrole
        </Link>{' '}
        (kolom “correcties” en “app incl. correcties”). Geen tweede Revolut-boeking.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-600">
          Datum (boekingsmaand)
          <input
            type="date"
            value={recordedOn}
            onChange={(e) => setRecordedOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Doel
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as api.ShopExpensePurpose)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="lunchkraam">Lunchkraam / tosti</option>
            <option value="avondeten">Avondeten</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as api.FinanceCorrectionKind)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="refund_outside_app">{financeCorrectionKindLabel('refund_outside_app')}</option>
            <option value="other_branch_guest">{financeCorrectionKindLabel('other_branch_guest')}</option>
            <option value="internal_settlement">{financeCorrectionKindLabel('internal_settlement')}</option>
            <option value="other">{financeCorrectionKindLabel('other')}</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-1">
          Bedrag (€, negatief = minder “app-verwachting”)
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="-12,50"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            required
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
          Toelichting
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Kort waarom (max. 500 tekens)"
          />
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-800 disabled:opacity-50"
          >
            {submitting ? 'Bezig…' : 'Correctie toevoegen'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        {listQuery.isFetching && rows.length === 0 ? (
          <p className="text-sm text-slate-600">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
            Geen correcties voor {year}.
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Doel</th>
                <th className="py-2 pr-3 text-right">Bedrag</th>
                <th className="py-2 pr-3">Toelichting</th>
                <th className="py-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-800">{row.recorded_on}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{financeCorrectionKindLabel(row.kind)}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{purposeLabel(row.purpose)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-slate-900">
                    {formatEUR(row.amount_eur)}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{row.description || '—'}</td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      disabled={deletingId !== null}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50 disabled:opacity-50"
                      onClick={() => void onDelete(row.id)}
                    >
                      {deletingId === row.id ? 'Bezig…' : 'Verwijderen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

type BankCreditsTab = 'open' | 'matched' | 'waived'

export function AdminFinancePage() {
  const { user, csrf } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [bankTab, setBankTab] = useState<BankCreditsTab>('open')
  const [unmatchingBankId, setUnmatchingBankId] = useState<number | null>(null)
  const [waivingBankId, setWaivingBankId] = useState<number | null>(null)
  const [manualMatchSelectId, setManualMatchSelectId] = useState('')
  const [suggestionsFor, setSuggestionsFor] = useState<number | null>(null)
  const [matchingId, setMatchingId] = useState<number | null>(null)

  const { yearsQuery, year, setYear } = useAdminSalesYearsSelect({
    isOperatorOnly,
    enabled: Boolean(user),
    onYearsError: (msg) => void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' }),
  })

  const salesStatsQuery = useQuery({
    queryKey: queryKeys.admin.salesStats(year ?? 0, isOperatorOnly),
    queryFn: () =>
      isOperatorOnly ? api.getOperatorSalesStats(year!) : api.getAdminSalesStats(year!),
    enabled: year !== null && Boolean(user),
  })

  useQueryErrorAlert(salesStatsQuery, { title: 'Cijfers laden mislukt', alert })

  const bankListsQuery = useQuery({
    queryKey: queryKeys.admin.bankCreditLists(year ?? 0, isOperatorOnly),
    queryFn: async () => {
      const y = year!
      const getUn = isOperatorOnly ? api.getOperatorBankCreditsUnmatched : api.getAdminBankCreditsUnmatched
      const getMat = isOperatorOnly ? api.getOperatorBankCreditsMatched : api.getAdminBankCreditsMatched
      const getWv = isOperatorOnly ? api.getOperatorBankCreditsWaived : api.getAdminBankCreditsWaived
      const [open, matched, waived] = await Promise.all([getUn(y), getMat(y), getWv(y)])
      return { bankRows: open.rows, matchedRows: matched.rows, waivedRows: waived.rows }
    },
    enabled: year !== null && Boolean(user),
  })

  useQueryErrorAlert(bankListsQuery, { title: 'Bankregels laden mislukt', alert })

  const suggestionPanelQuery = useQuery({
    queryKey: queryKeys.admin.bankSuggestionPanel(suggestionsFor ?? 0, isOperatorOnly),
    queryFn: async () => {
      const id = suggestionsFor
      if (id === null) {
        return {
          suggestions: [] as api.BankCreditSuggestionCandidate[],
          manualMatchDigital: [] as api.BankCreditSuggestionCandidate[],
          manualMatchPhysical: [] as api.BankCreditSuggestionCandidate[],
        }
      }
      const getSug = isOperatorOnly ? api.getOperatorBankCreditSuggestions : api.getAdminBankCreditSuggestions
      const getCand = isOperatorOnly
        ? api.getOperatorBankCreditMatchCandidates
        : api.getAdminBankCreditMatchCandidates
      const [sug, cand] = await Promise.all([getSug(id), getCand(id)])
      return {
        suggestions: sug.candidates,
        manualMatchDigital: cand.digital,
        manualMatchPhysical: cand.physical,
      }
    },
    enabled: suggestionsFor !== null && Boolean(user),
  })

  useQueryErrorAlert(suggestionPanelQuery, { title: 'Suggesties laden mislukt', alert })

  useEffect(() => {
    setManualMatchSelectId('')
  }, [suggestionsFor])

  const yearsLoading = yearsQuery.isLoading
  const salesStats = salesStatsQuery.data ?? null
  const statsLoading = salesStatsQuery.isFetching
  const bankRows = bankListsQuery.data?.bankRows ?? []
  const matchedRows = bankListsQuery.data?.matchedRows ?? []
  const waivedRows = bankListsQuery.data?.waivedRows ?? []
  const bankLoading = bankListsQuery.isFetching
  const suggestions = suggestionPanelQuery.data?.suggestions ?? []
  const manualMatchDigital = suggestionPanelQuery.data?.manualMatchDigital ?? []
  const manualMatchPhysical = suggestionPanelQuery.data?.manualMatchPhysical ?? []
  const suggestionsLoading = suggestionPanelQuery.isFetching && suggestionsFor !== null

  const yearOptions = useMemo(
    () => adminYearSelectOptions(yearsQuery.data, year),
    [yearsQuery.data, year],
  )

  const refreshYearFinance = useCallback(() => {
    if (year === null) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.bankCreditLists(year, isOperatorOnly) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.salesStats(year, isOperatorOnly) })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance-control'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.financeCorrections(year) })
  }, [queryClient, year, isOperatorOnly])

  const onMatch = useCallback(
    async (bankCreditId: number, cardRequestId: number) => {
      const ok = await confirm({
        title: 'Bankregel koppelen',
        message:
          'We koppelen deze Revolut-bijschrijving aan de gekozen kaartverkoop. Daarna telt het bedrag niet meer dubbel in het omzetoverzicht.',
        confirmLabel: 'Koppelen',
        cancelLabel: 'Annuleren',
      })
      if (!ok) return
      setMatchingId(cardRequestId)
      try {
        if (isOperatorOnly) {
          await api.postOperatorBankCreditMatch(csrf, bankCreditId, cardRequestId)
        } else {
          await api.postAdminBankCreditMatch(csrf, bankCreditId, cardRequestId)
        }
        void alert({ title: 'Gekoppeld', message: 'De bankregel is afgestemd.', variant: 'success' })
        setSuggestionsFor(null)
        refreshYearFinance()
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Koppelen mislukt.'
        void alert({ title: 'Koppelen mislukt', message: msg, variant: 'error' })
      } finally {
        setMatchingId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, refreshYearFinance],
  )

  const onUnmatch = useCallback(
    async (bankCreditId: number) => {
      const ok = await confirm({
        title: 'Koppeling verwijderen',
        message:
          'De bankregel komt weer in het overzicht als “niet gekoppeld” en telt weer mee bij bank-omzet tot je opnieuw koppelt.',
        confirmLabel: 'Ontkoppelen',
        cancelLabel: 'Annuleren',
        tone: 'danger',
      })
      if (!ok) return
      setUnmatchingBankId(bankCreditId)
      try {
        if (isOperatorOnly) {
          await api.postOperatorBankCreditUnmatch(csrf, bankCreditId)
        } else {
          await api.postAdminBankCreditUnmatch(csrf, bankCreditId)
        }
        void alert({ title: 'Ontkoppeld', message: 'De koppeling is verwijderd.', variant: 'success' })
        refreshYearFinance()
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Ontkoppelen mislukt.'
        void alert({ title: 'Ontkoppelen mislukt', message: msg, variant: 'error' })
      } finally {
        setUnmatchingBankId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, refreshYearFinance],
  )

  const onWaive = useCallback(
    async (bankCreditId: number) => {
      const ok = await confirm({
        title: 'Afhandelen zonder verkoop',
        message:
          'Deze bankregel verdwijnt uit “open bank-omzet”. Gebruik dit bij terugbetalingen of als er geen kaartverkoop in de app hoort. Dit is geen volledige boekhouding — alleen het interne rapport.',
        confirmLabel: 'Afhandelen',
        cancelLabel: 'Annuleren',
        tone: 'danger',
      })
      if (!ok) return
      setWaivingBankId(bankCreditId)
      try {
        if (isOperatorOnly) {
          await api.postOperatorBankCreditWaive(csrf, bankCreditId)
        } else {
          await api.postAdminBankCreditWaive(csrf, bankCreditId)
        }
        void alert({ title: 'Afgehandeld', message: 'De regel staat niet meer bij open bank-omzet.', variant: 'success' })
        refreshYearFinance()
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Actie mislukt.'
        void alert({ title: 'Afhandelen mislukt', message: msg, variant: 'error' })
      } finally {
        setWaivingBankId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, refreshYearFinance],
  )

  return (
    <div className="space-y-8">
      <section className="surface-card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Financiën en afstemming</h2>
        <p className="text-sm text-slate-600">
          Omzet in rapporten is <strong className="font-semibold text-slate-800">verkochte kaarten</strong> (geaccordeerd
          in de app) plus <strong className="font-semibold text-slate-800">Revolut-bijschrijvingen die nog “open” staan</strong>{' '}
          (niet gekoppeld aan een verkoop en niet als zonder verkoop afgehandeld). Koppel waar mogelijk; anders
          afhandelen zonder verkoop (bijv. terugbetaling).
        </p>
        <p className="text-sm text-slate-600">
          <Link to="/admin/expenses-overview" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Jaaroverzichten
          </Link>
          {' · '}
          <Link to="/admin/expenses" className="font-semibold text-brand-800 underline hover:text-brand-950">
            Boodschappen
          </Link>
          {' · '}
          <Link
            to="/admin/finance-control"
            className="font-semibold text-brand-800 underline hover:text-brand-950"
          >
            Verkoopcontrole
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

      {year !== null && (statsLoading || salesStats) ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Samenvatting omzet ({year})</h3>
          {statsLoading && !salesStats ? (
            <p className="text-sm text-slate-600">Laden…</p>
          ) : salesStats ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Totaal (rapport)</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                  {formatEUR(salesStats.year_revenue_eur)}
                </p>
              </div>
              <div className="rounded-2xl border border-brand-200 bg-brand-50/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Verkocht (app)</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-950">
                  {formatEUR(salesStats.year_revenue_card_sales_eur)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Bank nog niet gekoppeld</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-950">
                  {formatEUR(salesStats.year_revenue_bank_unmatched_eur)}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Revolut bankregels ({year ?? '—'})</h3>
          <div className="flex rounded-lg border border-slate-300 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setBankTab('open')
                setSuggestionsFor(null)
              }}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                bankTab === 'open' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Nog te koppelen ({bankRows.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setBankTab('matched')
                setSuggestionsFor(null)
              }}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                bankTab === 'matched' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Met verkoop ({matchedRows.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setBankTab('waived')
                setSuggestionsFor(null)
              }}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${
                bankTab === 'waived' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Zonder verkoop ({waivedRows.length})
            </button>
          </div>
        </div>
        {bankTab === 'open' ? (
          <>
            <p className="text-sm text-slate-600">
              Suggesties zoeken op bedrag, doel en ongeveer dezelfde datum (±14 dagen rond de Revolut-datum; Revolut kan
              later boeken). Staat de verkoop er niet tussen, kies dan handmatig een <strong className="font-semibold text-slate-800">openstaande Tikkie-verkoop</strong> in de lijst (digitaal of fysiek) — zelfde bedrag en doel als de bankregel.
            </p>
            {bankLoading && bankRows.length === 0 ? (
              <p className="text-sm text-slate-600">Laden…</p>
            ) : bankRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
                Geen openstaande bankregels voor dit jaar.
              </p>
            ) : (
              <div className="surface-card overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Datum</th>
                      <th className="py-2 pr-3">Bedrag</th>
                      <th className="py-2 pr-3">Doel</th>
                      <th className="py-2 pr-3">Omschrijving</th>
                      <th className="py-2">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankRows.map((row) => (
                      <Fragment key={row.id}>
                        <tr className="border-b border-slate-100 align-top">
                          <td className="py-2.5 pr-3 whitespace-nowrap text-slate-800">{row.received_on}</td>
                          <td className="py-2.5 pr-3 tabular-nums font-medium text-slate-900">
                            {formatEUR(row.amount_eur)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">{purposeLabel(row.purpose)}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{row.description || '—'}</td>
                          <td className="py-2.5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                              <button
                                type="button"
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                                onClick={() => {
                                  setSuggestionsFor((prev) => (prev === row.id ? null : row.id))
                                }}
                              >
                                {suggestionsFor === row.id ? 'Verberg suggesties' : 'Suggesties'}
                              </button>
                              <button
                                type="button"
                                disabled={waivingBankId !== null}
                                className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                                onClick={() => void onWaive(row.id)}
                              >
                                {waivingBankId === row.id ? 'Bezig…' : 'Zonder verkoop'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {suggestionsFor === row.id ? (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={5} className="px-2 py-3">
                              {suggestionsLoading ? (
                                <p className="text-sm text-slate-600">Suggesties laden…</p>
                              ) : suggestions.length === 0 ? (
                                <p className="text-sm text-slate-600">
                                  Geen automatische kandidaten in het zoekvenster. Kies handmatig een verkoop in de
                                  dropdown hieronder (zelfde bedrag en doel), of gebruik &ldquo;Zonder verkoop&rdquo; als
                                  de regel niet bij een kaart hoort.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {suggestions.map((c) => (
                                    <li
                                      key={c.card_request_id}
                                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="text-sm text-slate-700">
                                        <span className="font-semibold text-slate-900">Aanvraag #{c.card_request_id}</span>
                                        {' · '}
                                        {c.kind === 'avondeten' ? 'Avondeten' : 'Tosti'}
                                        {' · '}
                                        {formatEUR(c.sale_price_eur)}
                                        {' · '}
                                        {c.payment_method === 'tikkie' ? 'Tikkie' : 'Contant'}
                                        <br />
                                        <span className="text-xs text-slate-500">
                                          {c.user_display || c.user_email || 'Onbekend'} — {c.fulfilled_at}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={matchingId !== null}
                                        className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                                        onClick={() => void onMatch(row.id, c.card_request_id)}
                                      >
                                        {matchingId === c.card_request_id ? 'Bezig…' : 'Koppelen'}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="mt-4 border-t border-slate-200 pt-3">
                                <p className="mb-2 text-xs font-medium text-slate-700">Handmatig koppelen</p>
                                <p className="mb-2 text-xs text-slate-600">
                                  Alleen geaccordeerde Tikkie-verkopen met hetzelfde bedrag en doel als deze bankregel.
                                </p>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate-600">
                                    <span className="text-xs font-medium text-slate-700">Kaartverkoop</span>
                                    <select
                                      value={manualMatchSelectId}
                                      onChange={(e) => setManualMatchSelectId(e.target.value)}
                                      className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                                    >
                                      <option value="">— Kies een verkoop —</option>
                                      <optgroup label="Digitaal (app)">
                                        {manualMatchDigital.length === 0 ? (
                                          <option value="__no_digital__" disabled>
                                            Geen openstaande digitale verkopen voor dit bedrag
                                          </option>
                                        ) : (
                                          manualMatchDigital.map((c) => (
                                            <option key={c.card_request_id} value={String(c.card_request_id)}>
                                              {manualMatchOptionLabel(c)}
                                            </option>
                                          ))
                                        )}
                                      </optgroup>
                                      <optgroup label="Fysiek (kraam)">
                                        {manualMatchPhysical.length === 0 ? (
                                          <option value="__no_physical__" disabled>
                                            Geen openstaande fysieke verkopen voor dit bedrag
                                          </option>
                                        ) : (
                                          manualMatchPhysical.map((c) => (
                                            <option key={c.card_request_id} value={String(c.card_request_id)}>
                                              {manualMatchOptionLabel(c)}
                                            </option>
                                          ))
                                        )}
                                      </optgroup>
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    disabled={matchingId !== null || manualMatchSelectId === ''}
                                    className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                                    onClick={() => {
                                      const n = parseInt(manualMatchSelectId, 10)
                                      if (!Number.isFinite(n) || n <= 0) {
                                        void alert({
                                          title: 'Geen verkoop gekozen',
                                          message: 'Kies een kaartverkoop in de lijst.',
                                          variant: 'error',
                                        })
                                        return
                                      }
                                      void onMatch(row.id, n)
                                    }}
                                  >
                                    Koppelen
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : bankTab === 'matched' ? (
          <>
            <p className="text-sm text-slate-600">
              Gekoppeld aan een geaccordeerde verkoop: telt niet dubbel bij bank-omzet. Ontkoppel alleen bij een fout;
              daarna staat de regel weer bij &ldquo;Nog te koppelen&rdquo;.
            </p>
            {bankLoading && matchedRows.length === 0 ? (
              <p className="text-sm text-slate-600">Laden…</p>
            ) : matchedRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
                Geen gekoppelde bankregels voor dit jaar (of max. 500 meest recente).
              </p>
            ) : (
              <div className="surface-card overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Datum</th>
                      <th className="py-2 pr-3">Bedrag</th>
                      <th className="py-2 pr-3">Doel</th>
                      <th className="py-2 pr-3">Kaartverkoop</th>
                      <th className="py-2 pr-3">Omschrijving</th>
                      <th className="py-2">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-800">{row.received_on}</td>
                        <td className="py-2.5 pr-3 tabular-nums font-medium text-slate-900">
                          {formatEUR(row.amount_eur)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{purposeLabel(row.purpose)}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-slate-800">
                          #{row.matched_card_request_id ?? '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{row.description || '—'}</td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            disabled={unmatchingBankId !== null}
                            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50 disabled:opacity-50"
                            onClick={() => void onUnmatch(row.id)}
                          >
                            {unmatchingBankId === row.id ? 'Bezig…' : 'Ontkoppelen'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Afgehandeld zonder kaartverkoop in de app (bijv. terugbetaling). Telt niet mee bij open bank-omzet.{' '}
              <strong className="font-semibold text-slate-800">Ontkoppelen</strong> zet de regel terug naar open.
            </p>
            {bankLoading && waivedRows.length === 0 ? (
              <p className="text-sm text-slate-600">Laden…</p>
            ) : waivedRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-600">
                Geen op deze manier afgehandelde regels voor dit jaar.
              </p>
            ) : (
              <div className="surface-card overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Datum</th>
                      <th className="py-2 pr-3">Bedrag</th>
                      <th className="py-2 pr-3">Doel</th>
                      <th className="py-2 pr-3">Omschrijving</th>
                      <th className="py-2">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waivedRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-800">{row.received_on}</td>
                        <td className="py-2.5 pr-3 tabular-nums font-medium text-slate-900">
                          {formatEUR(row.amount_eur)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{purposeLabel(row.purpose)}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{row.description || '—'}</td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            disabled={unmatchingBankId !== null}
                            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-50 disabled:opacity-50"
                            onClick={() => void onUnmatch(row.id)}
                          >
                            {unmatchingBankId === row.id ? 'Bezig…' : 'Terug naar open'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {user?.is_admin && year !== null ? (
        <FinanceCorrectionsSection year={year} csrf={csrf} alert={alert} confirm={confirm} />
      ) : null}
    </div>
  )
}
