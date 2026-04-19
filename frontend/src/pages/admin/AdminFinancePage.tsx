import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'

function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

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

type BankCreditsTab = 'open' | 'matched' | 'waived'

export function AdminFinancePage() {
  const { user, csrf } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [yearsLoading, setYearsLoading] = useState(true)
  const [salesStats, setSalesStats] = useState<api.AdminSalesStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [bankTab, setBankTab] = useState<BankCreditsTab>('open')
  const [bankRows, setBankRows] = useState<api.BankCreditRow[]>([])
  const [matchedRows, setMatchedRows] = useState<api.BankCreditRow[]>([])
  const [waivedRows, setWaivedRows] = useState<api.BankCreditRow[]>([])
  const [bankLoading, setBankLoading] = useState(false)
  const [unmatchingBankId, setUnmatchingBankId] = useState<number | null>(null)
  const [waivingBankId, setWaivingBankId] = useState<number | null>(null)
  const [manualMatchDigital, setManualMatchDigital] = useState<api.BankCreditSuggestionCandidate[]>([])
  const [manualMatchPhysical, setManualMatchPhysical] = useState<api.BankCreditSuggestionCandidate[]>([])
  const [manualMatchSelectId, setManualMatchSelectId] = useState('')
  const [suggestionsFor, setSuggestionsFor] = useState<number | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<api.BankCreditSuggestionCandidate[]>([])
  const [matchingId, setMatchingId] = useState<number | null>(null)

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

  const loadSales = useCallback(
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

  const loadBankLists = useCallback(
    async (y: number) => {
      setBankLoading(true)
      try {
        const getUn = isOperatorOnly ? api.getOperatorBankCreditsUnmatched : api.getAdminBankCreditsUnmatched
        const getMat = isOperatorOnly ? api.getOperatorBankCreditsMatched : api.getAdminBankCreditsMatched
        const getWv = isOperatorOnly ? api.getOperatorBankCreditsWaived : api.getAdminBankCreditsWaived
        const [open, matched, waived] = await Promise.all([getUn(y), getMat(y), getWv(y)])
        setBankRows(open.rows)
        setMatchedRows(matched.rows)
        setWaivedRows(waived.rows)
      } catch (e) {
        setBankRows([])
        setMatchedRows([])
        setWaivedRows([])
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Bankregels laden mislukt', message: msg, variant: 'error' })
      } finally {
        setBankLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

  useEffect(() => {
    if (year === null) return
    void loadSales(year)
    void loadBankLists(year)
  }, [year, loadSales, loadBankLists])

  const yearOptions = useMemo(() => {
    const yNow = new Date().getFullYear()
    const base = years.length > 0 ? [...years] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [years, year])

  const loadSuggestions = useCallback(
    async (bankId: number) => {
      setSuggestionsLoading(true)
      setSuggestionsFor(bankId)
      setManualMatchDigital([])
      setManualMatchPhysical([])
      setManualMatchSelectId('')
      try {
        const getSug = isOperatorOnly ? api.getOperatorBankCreditSuggestions : api.getAdminBankCreditSuggestions
        const getCand = isOperatorOnly ? api.getOperatorBankCreditMatchCandidates : api.getAdminBankCreditMatchCandidates
        const [sug, cand] = await Promise.all([getSug(bankId), getCand(bankId)])
        setSuggestions(sug.candidates)
        setManualMatchDigital(cand.digital)
        setManualMatchPhysical(cand.physical)
      } catch (e) {
        setSuggestions([])
        setManualMatchDigital([])
        setManualMatchPhysical([])
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Suggesties laden mislukt', message: msg, variant: 'error' })
      } finally {
        setSuggestionsLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

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
        setSuggestions([])
        if (year !== null) {
          void loadBankLists(year)
          void loadSales(year)
        }
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Koppelen mislukt.'
        void alert({ title: 'Koppelen mislukt', message: msg, variant: 'error' })
      } finally {
        setMatchingId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, year, loadBankLists, loadSales],
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
        if (year !== null) {
          void loadBankLists(year)
          void loadSales(year)
        }
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Ontkoppelen mislukt.'
        void alert({ title: 'Ontkoppelen mislukt', message: msg, variant: 'error' })
      } finally {
        setUnmatchingBankId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, year, loadBankLists, loadSales],
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
        if (year !== null) {
          void loadBankLists(year)
          void loadSales(year)
        }
      } catch (e) {
        const msg = e instanceof api.ApiError ? e.message : 'Actie mislukt.'
        void alert({ title: 'Afhandelen mislukt', message: msg, variant: 'error' })
      } finally {
        setWaivingBankId(null)
      }
    },
    [confirm, csrf, alert, isOperatorOnly, year, loadBankLists, loadSales],
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
                setSuggestions([])
                setManualMatchDigital([])
                setManualMatchPhysical([])
                setManualMatchSelectId('')
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
                setSuggestions([])
                setManualMatchDigital([])
                setManualMatchPhysical([])
                setManualMatchSelectId('')
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
                setSuggestions([])
                setManualMatchDigital([])
                setManualMatchPhysical([])
                setManualMatchSelectId('')
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
                                  if (suggestionsFor === row.id) {
                                    setSuggestionsFor(null)
                                    setSuggestions([])
                                    setManualMatchDigital([])
                                    setManualMatchPhysical([])
                                    setManualMatchSelectId('')
                                    return
                                  }
                                  void loadSuggestions(row.id)
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
    </div>
  )
}
