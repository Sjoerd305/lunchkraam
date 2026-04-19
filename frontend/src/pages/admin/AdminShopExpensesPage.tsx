import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { queryKeys } from '../../queryKeys'
import { formatEUR } from '../../utils/formatMoney'

type ShopExpensesListBundle = {
  rows: api.AdminShopExpense[]
  receiptsByExpenseId: Record<number, api.ShopExpenseReceipt[]>
}

/** Manual boeking: contante uitgave, digitale uitgave (beide met verplichte bon), of contant bij de kas. */
type ShopBookingKind = 'contant_expense' | 'digital_expense' | 'cash_in'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shopExpensePurposeLabel(p: api.ShopExpensePurpose): string {
  return p === 'avondeten' ? 'Avondeten' : 'Lunchkraam'
}

function shopExpenseKindLabel(row: api.AdminShopExpense): string {
  if (row.amount_eur < 0) return 'Bij kas'
  if (row.payment_channel === 'digitaal') return 'Digitaal'
  return 'Contant'
}

function shopExpenseKindBadgeClass(row: api.AdminShopExpense): string {
  if (row.amount_eur < 0) {
    return 'rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900'
  }
  if (row.payment_channel === 'digitaal') {
    return 'rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900'
  }
  return 'rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800'
}

function formatDateTimeShortNL(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

function revolutSkipReasonLines(
  s: api.RevolutImportSkipReasons,
  mode: 'debit' | 'credit',
): { count: number; text: string }[] {
  const rows: { count: number; text: string }[] = []
  const push = (n: number, text: string) => {
    if (n > 0) rows.push({ count: n, text })
  }
  push(s.filter_not_completed, 'Niet voltooid of geannuleerd (statusfilter).')
  push(s.filter_currency_mismatch, 'Past niet bij het gekozen valuta-filter.')
  push(s.filter_type_skipped, 'Transactietype staat op de overslaan-lijst.')
  if (mode === 'debit') {
    push(s.not_debit, 'Geen afschrijving (bedrag is nul of positief).')
  }
  if (mode === 'credit') {
    push(s.not_credit, 'Geen te importeren ontvangst (nul of negatief bedrag).')
    push(
      s.amount_not_standard_card_price,
      'Positieve regels die om een andere reden niet als omzet zijn geboekt (zeldzaam; meld bij herhaling).',
    )
  }
  push(s.missing_external_id, 'Geen transactie-ID in het bestand én vingerafdruk staat uit.')
  push(s.user_excluded, 'Handmatig uitgesloten in het voorbeeld (wordt niet geïmporteerd).')
  push(s.other, 'Overig (onverwacht; meld dit als het vaak voorkomt).')
  return rows
}

function revolutImportResultDetail(
  r: api.RevolutShopExpenseImportResult,
  opts: { lunchEur: string; avoEur: string },
): ReactNode {
  const debitLines = revolutSkipReasonLines(r.debit_skip_reasons, 'debit')
  const creditLines = r.credits_enabled ? revolutSkipReasonLines(r.credit_skip_reasons, 'credit') : []

  return (
    <div className="space-y-5 text-left">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Uitgaven → deze pagina</h4>
        <p className="mt-1 text-xs text-slate-600">
          Afschrijvingen worden als regels in de tabel <strong>Boekingen</strong> gezet (bron Revolut). Herimport
          werkt bij; sommige regels gaan naar controle bij een mogelijke dubbele handmatige uitgave.
        </p>
        {r.debits_skipped > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
            {debitLines.map((row) => (
              <li key={row.text}>
                <span className="tabular-nums font-medium text-slate-900">{row.count}×</span> {row.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-600">Geen uitgaven-regels overgeslagen.</p>
        )}
      </div>

      {r.credits_enabled ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inkomsten → omzet (niet deze tabel)</h4>
          <p className="mt-1 text-xs text-slate-600">
            Alle <strong>positieve</strong> ontvangsten in het bestand worden als bank-omzet geboekt (mits filters
            zoals “alleen voltooid”). Bedragen die exact overeenkomen met je ingestelde lunch- (€{opts.lunchEur}) en/of
            avondetenkaartprijs (€{opts.avoEur}) krijgen dat doel automatisch; andere bedragen krijgen hetzelfde doel
            als bij uitgaven: met <strong>Raad doel op tijd</strong> volgens het tijdvenster, anders het gekozen
            standaard-doel. Aanpassen kan in het voorbeeld onder <em>Waarvoor ink.</em> De omzet telt mee op{' '}
            <Link to="/admin/expenses-overview" className="font-medium text-brand-700 underline hover:text-brand-900">
              Overzichten
            </Link>
            , niet als regels in de boodschappenlijst hieronder.
          </p>
          {r.credits_imported > 0 || r.credits_skipped > 0 ? (
            <p className="mt-2 text-xs text-slate-700">
              <span className="font-medium text-slate-900">Deze run:</span> lunchkraam-omzet:{' '}
              <span className="tabular-nums">{r.credits_imported_lunchkraam}</span>{' '}
              {r.dry_run ? 'zou(den) tellen' : 'geboekt'}, avondeten-omzet:{' '}
              <span className="tabular-nums">{r.credits_imported_avondeten}</span>{' '}
              {r.dry_run ? 'zou(den) tellen' : 'geboekt'} (samen <span className="tabular-nums">{r.credits_imported}</span>
              ).
              {r.credits_inferred_non_standard > 0 ? (
                <>
                  {' '}
                  Daarvan <span className="tabular-nums font-medium text-slate-900">{r.credits_inferred_non_standard}</span>{' '}
                  {r.dry_run ? 'zou(den) ' : ''}het kaartbedrag niet exact matchen (doel afgeleid of handmatig gekozen).
                </>
              ) : null}
            </p>
          ) : null}
          {r.credits_skipped > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              {creditLines.map((row) => (
                <li key={row.text}>
                  <span className="tabular-nums font-medium text-slate-900">{row.count}×</span> {row.text}
                </li>
              ))}
            </ul>
          ) : r.credits_imported > 0 ? (
            <p className="mt-2 text-xs text-slate-600">Geen inkomsten-regels overgeslagen.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AdminShopExpensesPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [year, setYear] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(todayISO)
  const [purpose, setPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [bookingKind, setBookingKind] = useState<ShopBookingKind>('contant_expense')
  const [description, setDescription] = useState('')
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingReceiptId, setUploadingReceiptId] = useState<number | null>(null)
  const [patchingPurposeId, setPatchingPurposeId] = useState<number | null>(null)

  const [revolutFile, setRevolutFile] = useState<File | null>(null)
  const [revolutPurpose, setRevolutPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [revolutFingerprint, setRevolutFingerprint] = useState(true)
  const [revolutDryRun, setRevolutDryRun] = useState(false)
  const [revolutSkipTypes, setRevolutSkipTypes] = useState('')
  const [revolutCurrencyEUR, setRevolutCurrencyEUR] = useState(true)
  const [revolutCompletedOnly, setRevolutCompletedOnly] = useState(true)
  const [revolutSubmitting, setRevolutSubmitting] = useState(false)
  const [revolutPreviewLoading, setRevolutPreviewLoading] = useState(false)
  const [revolutPreview, setRevolutPreview] = useState<api.RevolutPreviewResponse | null>(null)
  const [excludedDebit, setExcludedDebit] = useState<Record<string, boolean>>({})
  const [excludedCredit, setExcludedCredit] = useState<Record<string, boolean>>({})
  const [debitPurposeByKey, setDebitPurposeByKey] = useState<Record<string, api.ShopExpensePurpose>>({})
  const [creditPurposeByKey, setCreditPurposeByKey] = useState<Record<string, api.ShopExpensePurpose>>({})
  const [revolutImportCredits, setRevolutImportCredits] = useState(true)
  const [revolutGuessPurposeByTime, setRevolutGuessPurposeByTime] = useState(true)
  const [revolutCreditLunchEUR, setRevolutCreditLunchEUR] = useState('15')
  const [revolutCreditAvondetenEUR, setRevolutCreditAvondetenEUR] = useState('10')
  const [reviewActioning, setReviewActioning] = useState<number | null>(null)

  const yearsQuery = useQuery({
    queryKey: queryKeys.admin.salesYears(isOperatorOnly),
    queryFn: () => (isOperatorOnly ? api.getOperatorSalesYears() : api.getAdminSalesYears()),
    enabled: Boolean(user),
  })

  useEffect(() => {
    if (!yearsQuery.data) return
    const ys = yearsQuery.data
    setYear((prev) => {
      if (prev !== null && ys.includes(prev)) return prev
      return ys[0] ?? new Date().getFullYear()
    })
  }, [yearsQuery.data])

  useEffect(() => {
    if (!yearsQuery.isError || !yearsQuery.error) return
    setYear(new Date().getFullYear())
    const msg = yearsQuery.error instanceof api.ApiError ? yearsQuery.error.message : 'Laden mislukt.'
    void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' })
  }, [yearsQuery.isError, yearsQuery.error, alert])

  const listQuery = useQuery({
    queryKey: queryKeys.admin.shopExpensesList(year ?? 0, isOperatorOnly),
    queryFn: async (): Promise<ShopExpensesListBundle> => {
      const y = year!
      const list = isOperatorOnly ? await api.getOperatorShopExpenses(y) : await api.getAdminShopExpenses(y)
      const receiptEntries = await Promise.all(
        list.map(async (row) => {
          try {
            const receipts = await api.getShopExpenseReceipts(row.id, isOperatorOnly)
            return [row.id, receipts] as const
          } catch {
            return [row.id, []] as const
          }
        }),
      )
      return { rows: list, receiptsByExpenseId: Object.fromEntries(receiptEntries) }
    },
    enabled: year !== null && Boolean(user),
  })

  useEffect(() => {
    if (!listQuery.isError || !listQuery.error) return
    const msg = listQuery.error instanceof api.ApiError ? listQuery.error.message : 'Laden mislukt.'
    void alert({ title: 'Uitgaven laden mislukt', message: msg, variant: 'error' })
  }, [listQuery.isError, listQuery.error, alert])

  const revolutBalanceQuery = useQuery({
    queryKey: queryKeys.admin.revolutBalance(isOperatorOnly),
    queryFn: () => api.getRevolutBalance(isOperatorOnly),
    enabled: Boolean(user),
    retry: false,
  })

  const pendingReviewsQuery = useQuery({
    queryKey: queryKeys.admin.pendingReviews(isOperatorOnly),
    queryFn: () => api.getPendingImportReviews(isOperatorOnly),
    enabled: Boolean(user),
    retry: false,
  })

  const yearsLoading = yearsQuery.isLoading
  const rows = listQuery.data?.rows ?? []
  const receiptsByExpenseId = listQuery.data?.receiptsByExpenseId ?? {}
  const listLoading = listQuery.isFetching
  const revolutBalance = revolutBalanceQuery.data ?? null
  const revolutBalanceLoading = revolutBalanceQuery.isFetching
  const pendingReviews = pendingReviewsQuery.data ?? []

  const invalidateShopList = (y: number) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.shopExpensesList(y, isOperatorOnly) })

  useEffect(() => {
    if (!revolutPreview) {
      setDebitPurposeByKey({})
      setCreditPurposeByKey({})
      return
    }
    const d: Record<string, api.ShopExpensePurpose> = {}
    const c: Record<string, api.ShopExpensePurpose> = {}
    for (const pr of revolutPreview.rows) {
      if (pr.debit.selectable && pr.debit.row_key) {
        d[pr.debit.row_key] = pr.debit.purpose === 'avondeten' ? 'avondeten' : 'lunchkraam'
      }
      if (pr.credit.selectable && pr.credit.row_key) {
        c[pr.credit.row_key] = pr.credit.purpose === 'avondeten' ? 'avondeten' : 'lunchkraam'
      }
    }
    setDebitPurposeByKey(d)
    setCreditPurposeByKey(c)
  }, [revolutPreview])

  const previewCreditSplit = useMemo(() => {
    if (!revolutPreview?.credits_enabled) return null
    let lunch = 0
    let avo = 0
    for (const pr of revolutPreview.rows) {
      const ck = pr.credit.row_key
      if (!pr.credit.selectable || !ck) continue
      if (excludedCredit[ck]) continue
      const p = creditPurposeByKey[ck] ?? pr.credit.purpose ?? 'lunchkraam'
      if (p === 'lunchkraam') lunch++
      else avo++
    }
    return { lunch, avo, total: lunch + avo }
  }, [revolutPreview, creditPurposeByKey, excludedCredit])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (year === null) return
    const receiptRequired = bookingKind !== 'cash_in'
    if (receiptRequired && !newReceiptFile) {
      void alert({
        title: 'Bonfoto verplicht',
        message:
          'Selecteer een bonfoto voor een uitgave (contant of digitaal), of kies “Contant bij de kas” als er geen bon is.',
        variant: 'error',
      })
      return
    }
    const n = parseFloat(String(amount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      void alert({ title: 'Ongeldig bedrag', message: 'Vul een positief getal in.', variant: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const body =
        bookingKind === 'cash_in'
          ? {
              amount_eur: n,
              spent_on: spentOn,
              description: description.trim(),
              purpose,
              movement: 'cash_in' as const,
            }
          : {
              amount_eur: n,
              spent_on: spentOn,
              description: description.trim(),
              purpose,
              payment_channel: bookingKind === 'digital_expense' ? ('digitaal' as const) : ('contant' as const),
            }
      const createdExpense = isOperatorOnly
        ? await api.createOperatorShopExpense(csrf, body)
        : await api.createShopExpense(csrf, body)
      if (newReceiptFile) {
        await api.uploadShopExpenseReceipt(csrf, createdExpense.id, newReceiptFile, isOperatorOnly)
      }
      setAmount('')
      setDescription('')
      setPurpose('lunchkraam')
      setBookingKind('contant_expense')
      setSpentOn(todayISO())
      setNewReceiptFile(null)
      await invalidateShopList(year)
      void alert({
        title: 'Opgeslagen',
        message:
          bookingKind === 'cash_in'
            ? 'Boeking is toegevoegd.'
            : bookingKind === 'digital_expense'
              ? 'Digitale uitgave is toegevoegd.'
              : 'Contante uitgave is toegevoegd.',
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const yearOptions = useMemo(() => {
    const yearsList = yearsQuery.data ?? []
    const yNow = new Date().getFullYear()
    const base = yearsList.length > 0 ? [...yearsList] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [yearsQuery.data, year])

  async function onPurposeChange(expenseId: number, nextPurpose: api.ShopExpensePurpose) {
    if (year === null) return
    const prev = rows.find((x) => x.id === expenseId)
    if (!prev || prev.purpose === nextPurpose) return
    const listKey = queryKeys.admin.shopExpensesList(year, isOperatorOnly)
    queryClient.setQueryData(listKey, (old: ShopExpensesListBundle | undefined) => {
      if (!old) return old
      return { ...old, rows: old.rows.map((row) => (row.id === expenseId ? { ...row, purpose: nextPurpose } : row)) }
    })
    setPatchingPurposeId(expenseId)
    try {
      const updated = await api.patchShopExpensePurpose(csrf, expenseId, nextPurpose, isOperatorOnly)
      queryClient.setQueryData(listKey, (old: ShopExpensesListBundle | undefined) => {
        if (!old) return old
        return { ...old, rows: old.rows.map((row) => (row.id === expenseId ? updated : row)) }
      })
    } catch (err) {
      queryClient.setQueryData(listKey, (old: ShopExpensesListBundle | undefined) => {
        if (!old) return old
        return {
          ...old,
          rows: old.rows.map((row) => (row.id === expenseId ? { ...row, purpose: prev.purpose } : row)),
        }
      })
      const msg = err instanceof api.ApiError ? err.message : 'Bijwerken mislukt.'
      await alert({ title: 'Waarvoor wijzigen mislukt', message: msg, variant: 'error' })
    } finally {
      setPatchingPurposeId(null)
    }
  }

  async function onDelete(id: number) {
    const ok = await confirm({
      title: 'Uitgave verwijderen?',
      message: 'Dit kan niet ongedaan worden gemaakt.',
      tone: 'danger',
      confirmLabel: 'Verwijderen',
    })
    if (!ok || year === null) return
    try {
      await api.deleteShopExpense(csrf, id)
      await invalidateShopList(year)
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  async function onUploadReceipt(expenseId: number, file: File | null) {
    if (!file || year === null) return
    setUploadingReceiptId(expenseId)
    try {
      const receipt = await api.uploadShopExpenseReceipt(csrf, expenseId, file, isOperatorOnly)
      const listKey = queryKeys.admin.shopExpensesList(year, isOperatorOnly)
      queryClient.setQueryData(listKey, (old: ShopExpensesListBundle | undefined) => {
        if (!old) return old
        return {
          ...old,
          receiptsByExpenseId: {
            ...old.receiptsByExpenseId,
            [expenseId]: [...(old.receiptsByExpenseId[expenseId] ?? []), receipt],
          },
        }
      })
      await alert({ title: 'Bonfoto opgeslagen', message: 'De bonfoto is toegevoegd.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Uploaden mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setUploadingReceiptId(null)
    }
  }

  async function onDeleteReceipt(expenseId: number, receiptId: number) {
    if (year === null) return
    const ok = await confirm({
      title: 'Bonfoto verwijderen?',
      message: 'Dit kan niet ongedaan worden gemaakt.',
      tone: 'danger',
      confirmLabel: 'Verwijderen',
    })
    if (!ok) return
    try {
      await api.deleteShopExpenseReceipt(csrf, expenseId, receiptId)
      const listKey = queryKeys.admin.shopExpensesList(year, isOperatorOnly)
      queryClient.setQueryData(listKey, (old: ShopExpensesListBundle | undefined) => {
        if (!old) return old
        return {
          ...old,
          receiptsByExpenseId: {
            ...old.receiptsByExpenseId,
            [expenseId]: (old.receiptsByExpenseId[expenseId] ?? []).filter((r) => r.id !== receiptId),
          },
        }
      })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  function onNewReceiptFileSelected(file: File | null) {
    setNewReceiptFile(file)
  }

  async function onMergeReview(reviewId: number) {
    if (year === null) return
    setReviewActioning(reviewId)
    try {
      await api.mergePendingReview(csrf, reviewId, isOperatorOnly)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingReviews(isOperatorOnly) })
      await invalidateShopList(year)
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Samenvoegen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setReviewActioning(null)
    }
  }

  async function onDismissReview(reviewId: number) {
    setReviewActioning(reviewId)
    try {
      await api.dismissPendingReview(csrf, reviewId, isOperatorOnly)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingReviews(isOperatorOnly) })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Overslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setReviewActioning(null)
    }
  }

  async function runRevolutPreview() {
    if (!user) {
      await alert({
        title: 'Niet ingelogd',
        message: 'Log opnieuw in om een voorbeeld te tonen.',
        variant: 'error',
      })
      return
    }
    if (!revolutFile) {
      await alert({ title: 'Geen bestand', message: 'Kies een Revolut CSV-export.', variant: 'error' })
      return
    }
    setRevolutPreviewLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', revolutFile)
      fd.append('purpose', revolutPurpose)
      fd.append('fingerprint_missing_id', revolutFingerprint ? '1' : '0')
      fd.append('completed_only', revolutCompletedOnly ? '1' : '0')
      if (revolutSkipTypes.trim()) fd.append('skip_types', revolutSkipTypes.trim())
      fd.append('currency', revolutCurrencyEUR ? 'EUR' : '')
      fd.append('import_credits', revolutImportCredits ? '1' : '0')
      fd.append('guess_purpose_by_time', revolutGuessPurposeByTime ? '1' : '0')
      fd.append('credit_lunch_eur', revolutCreditLunchEUR.trim())
      fd.append('credit_avondeten_eur', revolutCreditAvondetenEUR.trim())
      const p = await api.previewRevolutShopExpenses(csrf, fd, isOperatorOnly)
      setRevolutPreview(p)
      setExcludedDebit({})
      setExcludedCredit({})
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Voorbeeld laden mislukt.'
      await alert({ title: 'Voorbeeld mislukt', message: msg, variant: 'error' })
    } finally {
      setRevolutPreviewLoading(false)
    }
  }

  async function runRevolutImport() {
    if (!user) {
      await alert({
        title: 'Niet ingelogd',
        message: 'Log opnieuw in om te importeren.',
        variant: 'error',
      })
      return
    }
    if (!revolutFile) {
      await alert({ title: 'Geen bestand', message: 'Kies een Revolut CSV-export.', variant: 'error' })
      return
    }
    const yearToRefresh = year ?? new Date().getFullYear()
    setRevolutSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', revolutFile)
      fd.append('purpose', revolutPurpose)
      fd.append('fingerprint_missing_id', revolutFingerprint ? '1' : '0')
      fd.append('dry_run', revolutDryRun ? '1' : '0')
      fd.append('completed_only', revolutCompletedOnly ? '1' : '0')
      if (revolutSkipTypes.trim()) fd.append('skip_types', revolutSkipTypes.trim())
      fd.append('currency', revolutCurrencyEUR ? 'EUR' : '')
      fd.append('import_credits', revolutImportCredits ? '1' : '0')
      fd.append('guess_purpose_by_time', revolutGuessPurposeByTime ? '1' : '0')
      fd.append('credit_lunch_eur', revolutCreditLunchEUR.trim())
      fd.append('credit_avondeten_eur', revolutCreditAvondetenEUR.trim())
      const debitExcluded = Object.keys(excludedDebit).filter((k) => excludedDebit[k])
      const creditExcluded = Object.keys(excludedCredit).filter((k) => excludedCredit[k])
      if (debitExcluded.length > 0 || creditExcluded.length > 0) {
        fd.append('exclude_json', JSON.stringify({ debit: debitExcluded, credit: creditExcluded }))
      }
      if (revolutPreview) {
        const purposeDebit: Record<string, string> = {}
        const purposeCredit: Record<string, string> = {}
        for (const pr of revolutPreview.rows) {
          const dk = pr.debit.row_key
          if (pr.debit.selectable && dk && debitPurposeByKey[dk]) purposeDebit[dk] = debitPurposeByKey[dk]
          const ck = pr.credit.row_key
          if (pr.credit.selectable && ck && creditPurposeByKey[ck]) purposeCredit[ck] = creditPurposeByKey[ck]
        }
        if (Object.keys(purposeDebit).length > 0 || Object.keys(purposeCredit).length > 0) {
          fd.append('purpose_overrides_json', JSON.stringify({ debit: purposeDebit, credit: purposeCredit }))
        }
      }
      const r = await api.importRevolutShopExpenses(csrf, fd, isOperatorOnly)
      const lunchEur = revolutCreditLunchEUR.trim() || '15'
      const avoEur = revolutCreditAvondetenEUR.trim() || '10'
      const debitLine = r.dry_run
        ? `Uitgaven (proef): ${r.debits_imported} zouden worden geboekt, ${r.debits_skipped} regels overgeslagen.`
        : `Uitgaven: ${r.debits_imported} geïmporteerd of bijgewerkt, ${r.debits_skipped} regels overgeslagen.`
      const pendingLine =
        !r.dry_run && r.debits_pending_review > 0
          ? `${r.debits_pending_review} mogelijke duplica${r.debits_pending_review === 1 ? 'at' : 'ten'} in de wachtrij hieronder.`
          : ''
      const creditLine =
        r.credits_enabled &&
        (r.dry_run
          ? `Inkomsten (proef): ${r.credits_imported} zouden als omzet worden geboekt, ${r.credits_skipped} regels overgeslagen.`
          : `Inkomsten (omzet): ${r.credits_imported} geboekt, ${r.credits_skipped} regels overgeslagen.`)
      const msg = [debitLine, pendingLine, creditLine].filter(Boolean).join('\n')
      await alert({
        title: r.dry_run ? 'Proefrun' : 'Revolut-import',
        message: msg,
        detail: revolutImportResultDetail(r, { lunchEur, avoEur }),
        variant: 'success',
      })
      if (!r.dry_run) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.admin.revolutBalance(isOperatorOnly) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.admin.pendingReviews(isOperatorOnly) })
      }
      if (!r.dry_run && (r.debits_imported > 0 || r.credits_imported > 0)) await invalidateShopList(yearToRefresh)
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Importeren mislukt.'
      await alert({ title: 'Revolut-import mislukt', message: msg, variant: 'error' })
    } finally {
      setRevolutSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Boodschappen &amp; uitgaven</h2>
        <p className="mt-2 text-slate-600">
          Boek boodschappen voor de lunchkraam en voor het avondeten (beide uit dezelfde omzet). Je kunt een{' '}
          <strong className="font-semibold text-slate-800">contante uitgave</strong>, een{' '}
          <strong className="font-semibold text-slate-800">digitale uitgave</strong> (bijv. pin; met bonfoto), of{' '}
          <strong className="font-semibold text-slate-800">los contant bij de kas</strong> boeken (verhoogt het saldo
          in het jaaroverzicht). Omzet = geaccordeerde kaartverkopen dit jaar; de kolom uitgaven op Overzichten is de
          som van deze boekingen (uitgaven min contant bij).
          {isOperatorOnly ? ' Verkochte tosti’s op basis van levermoment.' : ''}
        </p>
      </div>

      <section className="surface-card">
        <h3 className="text-sm font-semibold text-slate-800">Nieuwe boeking</h3>
        <p className="mt-1 text-xs text-slate-600">
          Contante en digitale uitgave: bon verplicht. Contant bij de kas: optioneel een foto; het bedrag telt als
          storting (netto stijgt in het jaaroverzicht).
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <fieldset className="block text-sm sm:col-span-2 lg:col-span-3">
            <legend className="font-medium text-slate-700">Soort</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600">
                <input
                  type="radio"
                  name="shop-booking-kind"
                  checked={bookingKind === 'contant_expense'}
                  onChange={() => setBookingKind('contant_expense')}
                  className="text-brand-700"
                />
                <span className="text-slate-800">Contante uitgave (af)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600">
                <input
                  type="radio"
                  name="shop-booking-kind"
                  checked={bookingKind === 'digital_expense'}
                  onChange={() => setBookingKind('digital_expense')}
                  className="text-brand-700"
                />
                <span className="text-slate-800">Digitale uitgave (af)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600">
                <input
                  type="radio"
                  name="shop-booking-kind"
                  checked={bookingKind === 'cash_in'}
                  onChange={() => setBookingKind('cash_in')}
                  className="text-brand-700"
                />
                <span className="text-slate-800">Contant bij de kas (bij)</span>
              </label>
            </div>
          </fieldset>
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Bedrag (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="12,50"
              className="input-control mt-1.5"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Datum bon / aankoop</span>
            <input
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className="input-control mt-1.5"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-slate-700">Waarvoor</span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as api.ShopExpensePurpose)}
              className="select-control mt-1.5 min-h-11 w-full"
            >
              <option value="lunchkraam">Lunchkraam</option>
              <option value="avondeten">Avondeten</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="font-medium text-slate-700">Omschrijving (optioneel)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="bijv. Albert Heijn, brood"
              className="input-control mt-1.5"
            />
          </label>
          <div className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="font-medium text-slate-700">
              Bonfoto{bookingKind === 'cash_in' ? ' (optioneel)' : ' (verplicht)'}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <label className="btn-secondary inline-flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onNewReceiptFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <label className="btn-secondary inline-flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                Galerij
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onNewReceiptFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
            {newReceiptFile ? <span className="mt-1 block text-xs text-slate-600">{newReceiptFile.name}</span> : null}
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={
                submitting || year === null || (bookingKind !== 'cash_in' && !newReceiptFile)
              }
              className="btn-primary min-h-11 px-5"
            >
              {submitting ? 'Bezig…' : 'Toevoegen'}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-card">
        <h3 className="text-sm font-semibold text-slate-800">Revolut-saldo</h3>
        <p className="mt-2 text-sm text-slate-600">
          Het saldo komt uit de kolom <strong>Saldo</strong> van je laatst <strong>succesvol geïmporteerde</strong>{' '}
          Revolut-csv (nieuwste voltooide EUR-regel). Dit is geen live koppeling met Revolut; exporteer opnieuw voor een
          actueler cijfer.
        </p>
        <div className="mt-3 text-sm text-slate-800">
          {revolutBalanceLoading ? (
            <span className="text-slate-500">Saldo laden…</span>
          ) : revolutBalance != null &&
            revolutBalance.balance_eur != null &&
            revolutBalance.updated_at != null &&
            revolutBalance.updated_at !== '' ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold tabular-nums">{formatEUR(revolutBalance.balance_eur)}</p>
              {revolutBalance.statement_as_of ? (
                <p className="text-slate-600">
                  Per afschrift (transactiedatum): {formatDateTimeShortNL(revolutBalance.statement_as_of)}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">
                In Lunchkraam bijgewerkt: {formatDateTimeShortNL(revolutBalance.updated_at)}
              </p>
            </div>
          ) : (
            <p className="text-slate-600">
              Nog geen saldo opgeslagen. Importeer een csv-export met saldokolom (zonder proefrun) om het hier te tonen.
            </p>
          )}
        </div>
      </section>

      <section className="surface-card">
        <h3 className="text-sm font-semibold text-slate-800">Revolut-import (CSV)</h3>
        <p className="mt-2 text-sm text-slate-600">
          Upload een accountafschrift-export van Revolut. <strong>Afschrijvingen</strong> worden als uitgave geboekt; bij
          tijdherkenning zetten we <strong>waarvoor</strong> per regel op basis van het voltooide tijdstip (Europe/Amsterdam:
          ochtend ca. 08:00–13:00 → lunchkraam, avond ca. 16:00–19:00 → avondeten; anders het gekozen standaarddoel).
          Optioneel worden <strong>tegoeden</strong> die exact €15 of €10 zijn (instelbaar) als omzet in de grafieken
          meegeteld: €15 → lunchkraam, €10 → avondeten. Tel die bedragen niet dubbel met al in de app geaccordeerde
          kaartverkopen. <strong>Inkomsten uit deze import</strong> verschijnen niet in de tabel Boekingen op deze pagina;
          die staan bij <Link to="/admin/expenses-overview">Overzichten</Link> in de omzet.
        </p>
        <form
          id="revolut-shop-import-form"
          onSubmit={(e) => {
            e.preventDefault()
            void runRevolutImport()
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">CSV-bestand</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="input-control mt-1.5"
              onChange={(e) => {
                setRevolutFile(e.target.files?.[0] ?? null)
                setRevolutPreview(null)
                setExcludedDebit({})
                setExcludedCredit({})
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Standaard waarvoor</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Gebruikt als het tijdstip niet in het ochtend- of avondvenster valt (of als tijdherkenning uit staat).
            </span>
            <select
              value={revolutPurpose}
              onChange={(e) => setRevolutPurpose(e.target.value as api.ShopExpensePurpose)}
              className="select-control mt-1.5 min-h-11 w-full"
            >
              <option value="lunchkraam">Lunchkraam</option>
              <option value="avondeten">Avondeten</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Valuta-filter</span>
            <select
              value={revolutCurrencyEUR ? 'eur' : 'all'}
              onChange={(e) => setRevolutCurrencyEUR(e.target.value === 'eur')}
              className="select-control mt-1.5 min-h-11 w-full"
            >
              <option value="eur">Alleen EUR</option>
              <option value="all">Alle valuta</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-800 sm:col-span-2">
            <input
              type="checkbox"
              checked={revolutGuessPurposeByTime}
              onChange={(e) => setRevolutGuessPurposeByTime(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
            />
            <span>
              <span className="font-medium text-slate-700">Waarvoor afleiden uit tijdstip</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Voltooide tijd in Europe/Amsterdam: 08:00–13:00 → lunchkraam, 16:00–19:00 → avondeten; anders het
                standaarddoel hierboven.
              </span>
            </span>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Types overslaan (optioneel)</span>
            <input
              type="text"
              value={revolutSkipTypes}
              onChange={(e) => setRevolutSkipTypes(e.target.value)}
              placeholder="bijv. TOPUP, EXCHANGE"
              className="input-control mt-1.5"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={revolutFingerprint}
              onChange={(e) => setRevolutFingerprint(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Vingerafdruk als er geen ID-kolom is
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={revolutCompletedOnly}
              onChange={(e) => setRevolutCompletedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Alleen voltooide transacties (VOLTOOID / COMPLETED)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
            <input
              type="checkbox"
              checked={revolutImportCredits}
              onChange={(e) => setRevolutImportCredits(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Inkomsten importeren (positieve regels die exact matchen met onderstaande bedragen)
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Lunchkraam-kaartbedrag (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={revolutCreditLunchEUR}
              onChange={(e) => setRevolutCreditLunchEUR(e.target.value)}
              placeholder="15"
              disabled={!revolutImportCredits}
              className="input-control mt-1.5"
            />
            <span className="mt-1 block text-xs text-slate-500">0 = dit type niet importeren</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Avondeten-kaartbedrag (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={revolutCreditAvondetenEUR}
              onChange={(e) => setRevolutCreditAvondetenEUR(e.target.value)}
              placeholder="10"
              disabled={!revolutImportCredits}
              className="input-control mt-1.5"
            />
            <span className="mt-1 block text-xs text-slate-500">0 = dit type niet importeren</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
            <input
              type="checkbox"
              checked={revolutDryRun}
              onChange={(e) => setRevolutDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Alleen proefrun (niets opslaan)
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={revolutPreviewLoading || revolutSubmitting || !revolutFile}
              className="btn-secondary min-h-11 px-5"
              onClick={() => void runRevolutPreview()}
            >
              {revolutPreviewLoading ? 'Voorbeeld…' : 'Voorbeeld tonen'}
            </button>
            <button
              type="button"
              disabled={revolutPreviewLoading || revolutSubmitting || !revolutFile}
              className="btn-primary min-h-11 px-5"
              onClick={() => void runRevolutImport()}
            >
              {revolutSubmitting ? 'Bezig…' : revolutDryRun ? 'Proefrun' : 'Importeren'}
            </button>
          </div>
        </form>
        {revolutPreview ? (
          <div className="mt-6 border-t border-slate-200 pt-6">
            <h4 className="text-sm font-semibold text-slate-900">Transactievoorbeeld ({revolutPreview.rows.length} regels)</h4>
            <p className="mt-1 text-xs text-slate-600">
              Vink <strong>Meenemen</strong> uit om een geplande uitgave- of inkomstenactie over te slaan bij import. Kies
              per regel <strong>Waarvoor</strong> (lunchkraam of avondeten) vóór je importeert — dat overschrijft
              tijdafleiding voor uitgaven en het standaard kaartbedrag-label voor inkomsten. Bedragen wijzig je in het CSV.
            </p>
            <div className="mt-3 max-h-[min(70vh,28rem)] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[72rem] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Datum</th>
                    <th className="px-2 py-2">Bedrag</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Omschrijving</th>
                    <th className="px-2 py-2">Waarvoor uit</th>
                    <th className="px-2 py-2">Uitgave</th>
                    <th className="px-2 py-2 text-center">Uit.</th>
                    <th className="px-2 py-2">Waarvoor ink.</th>
                    <th className="px-2 py-2">Inkomsten</th>
                    <th className="px-2 py-2 text-center">Ink.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {revolutPreview.rows.map((pr) => {
                    const dk = pr.debit.row_key ?? ''
                    const ck = pr.credit.row_key ?? ''
                    const debitIn = pr.debit.selectable && dk ? !excludedDebit[dk] : false
                    const creditIn = pr.credit.selectable && ck ? !excludedCredit[ck] : false
                    return (
                      <tr key={pr.line} className="align-top text-slate-800">
                        <td className="px-2 py-1.5 tabular-nums text-slate-500">{pr.line}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                          {formatDateTimeShortNL(pr.completed_at)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums font-medium">{formatEUR(pr.amount_eur)}</td>
                        <td className="px-2 py-1.5 text-slate-600">{pr.type || '—'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{pr.state || '—'}</td>
                        <td className="max-w-[14rem] px-2 py-1.5 break-words text-slate-700">{pr.description || '—'}</td>
                        <td className="px-2 py-1.5">
                          {pr.debit.selectable && dk ? (
                            <select
                              className="select-control max-w-[10.5rem] py-1 text-xs"
                              value={debitPurposeByKey[dk] ?? 'lunchkraam'}
                              onChange={(e) => {
                                const v = e.target.value as api.ShopExpensePurpose
                                setDebitPurposeByKey((prev) => ({ ...prev, [dk]: v }))
                              }}
                            >
                              <option value="lunchkraam">Lunchkraam</option>
                              <option value="avondeten">Avondeten</option>
                            </select>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{pr.debit.label_nl}</td>
                        <td className="px-2 py-1.5 text-center">
                          {pr.debit.selectable && dk ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={debitIn}
                              title="Meenemen als uitgave"
                              onChange={(e) => {
                                setExcludedDebit((prev) => {
                                  const next = { ...prev }
                                  if (e.target.checked) delete next[dk]
                                  else next[dk] = true
                                  return next
                                })
                              }}
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {pr.credit.selectable && ck ? (
                            <select
                              className="select-control max-w-[10.5rem] py-1 text-xs"
                              value={creditPurposeByKey[ck] ?? 'lunchkraam'}
                              onChange={(e) => {
                                const v = e.target.value as api.ShopExpensePurpose
                                setCreditPurposeByKey((prev) => ({ ...prev, [ck]: v }))
                              }}
                            >
                              <option value="lunchkraam">Lunchkraam</option>
                              <option value="avondeten">Avondeten</option>
                            </select>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{pr.credit.label_nl}</td>
                        <td className="px-2 py-1.5 text-center">
                          {pr.credit.selectable && ck ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={creditIn}
                              title="Meenemen als omzet"
                              onChange={(e) => {
                                setExcludedCredit((prev) => {
                                  const next = { ...prev }
                                  if (e.target.checked) delete next[ck]
                                  else next[ck] = true
                                  return next
                                })
                              }}
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Samenvatting voorbeeld: {revolutPreview.debits_imported} uitgaven-acties, {revolutPreview.debits_skipped}{' '}
              uitgaven overgeslagen
              {revolutPreview.debits_pending_review > 0
                ? `, ${revolutPreview.debits_pending_review} naar controle`
                : ''}
              {revolutPreview.credits_enabled
                ? ` · ${revolutPreview.credits_imported} inkomsten-acties, ${revolutPreview.credits_skipped} inkomsten overgeslagen`
                : ''}
              .
              {revolutPreview.credits_enabled && revolutPreview.credits_inferred_non_standard > 0
                ? ` Daarvan ${revolutPreview.credits_inferred_non_standard} met een afwijkend bedrag t.o.v. de ingestelde kaartprijzen (doel via tijdvenster of standaard-doel; aanpasbaar onder Waarvoor ink.).`
                : ''}
              {previewCreditSplit && previewCreditSplit.total > 0 ? (
                <>
                  {' '}
                  Inkomsten meegenomen (na je keuzes): lunchkraam {previewCreditSplit.lunch}, avondeten{' '}
                  {previewCreditSplit.avo} (samen {previewCreditSplit.total}).
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </section>

      {pendingReviews.length > 0 && (
        <section className="surface-card">
          <h3 className="text-sm font-semibold text-slate-800">
            Mogelijke duplicaten ({pendingReviews.length})
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Deze Revolut-transacties komen overeen met handmatig ingevoerde uitgaven (zelfde bedrag en datum). Kies per
            regel wat je wilt doen.
          </p>
          <div className="mt-4 space-y-4">
            {pendingReviews.map((rv) => (
              <div key={rv.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revolut-import</span>
                    <p className="mt-1 font-medium tabular-nums text-slate-900">{formatEUR(rv.revolut.amount_eur)}</p>
                    <p className="text-sm text-slate-700">{rv.revolut.spent_on}</p>
                    <p className="text-xs text-slate-600">{rv.revolut.description || '\u2014'}</p>
                    <p className="text-xs text-slate-500">{shopExpensePurposeLabel(rv.revolut.purpose)}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Handmatige boeking
                    </span>
                    <p className="mt-1 font-medium tabular-nums text-slate-900">
                      {formatEUR(rv.matched_manual.amount_eur)}
                    </p>
                    <p className="text-sm text-slate-700">{rv.matched_manual.spent_on}</p>
                    <p className="text-xs text-slate-600">{rv.matched_manual.description || '\u2014'}</p>
                    <p className="text-xs text-slate-500">{shopExpensePurposeLabel(rv.matched_manual.purpose)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reviewActioning === rv.id}
                    onClick={() => void onMergeReview(rv.id)}
                    className="btn-primary min-h-9 px-3 text-xs"
                  >
                    {reviewActioning === rv.id ? 'Bezig\u2026' : 'Samenvoegen'}
                  </button>
                  <button
                    type="button"
                    disabled={reviewActioning === rv.id}
                    onClick={() => void onDismissReview(rv.id)}
                    className="text-xs font-semibold text-red-700 hover:text-red-900"
                  >
                    Overslaan
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Samenvoegen = handmatige boeking verwijderen, Revolut-import behouden (bonnetjes worden overgezet).
                  Overslaan = Revolut-import negeren.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="surface-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Boekingen</h3>
          {yearsLoading ? (
            <span className="text-sm text-slate-500">Jaren laden…</span>
          ) : year !== null ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-medium">Jaar</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="select-control min-h-10"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {listLoading ? (
          <p className="mt-6 text-sm text-slate-600">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-600">
            Geen boekingen in {year ?? 'dit jaar'}.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Datum</th>
                  <th className="py-2 pr-4">Bedrag</th>
                  <th className="py-2 pr-4">Soort</th>
                  <th className="py-2 pr-4">Waarvoor</th>
                  <th className="py-2 pr-4">Bron</th>
                  <th className="py-2 pr-4">Omschrijving</th>
                  <th className="py-2 pr-4">Bon</th>
                  {user?.is_admin ? <th className="py-2 text-right">Actie</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 tabular-nums text-slate-800">{r.spent_on}</td>
                    <td className="py-3 pr-4 font-medium tabular-nums text-slate-900">
                      {formatEUR(r.amount_eur)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-600">
                      <span className={shopExpenseKindBadgeClass(r)}>{shopExpenseKindLabel(r)}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      <select
                        value={r.purpose}
                        disabled={patchingPurposeId === r.id}
                        onChange={(e) =>
                          void onPurposeChange(r.id, e.target.value as api.ShopExpensePurpose)
                        }
                        className="select-control min-h-9 max-w-[12rem] text-xs"
                        aria-label={`Waarvoor voor uitgave ${r.spent_on}`}
                      >
                        <option value="lunchkraam">{shopExpensePurposeLabel('lunchkraam')}</option>
                        <option value="avondeten">{shopExpensePurposeLabel('avondeten')}</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-600">
                      {r.source === 'revolut' ? 'Revolut' : 'Handmatig'}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{r.description || '—'}</td>
                    <td className="py-3 pr-4 text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="btn-secondary inline-flex min-h-9 cursor-pointer items-center px-3 text-xs">
                          {uploadingReceiptId === r.id ? 'Uploaden…' : 'Camera'}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={uploadingReceiptId === r.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null
                              void onUploadReceipt(r.id, file)
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                        <label className="btn-secondary inline-flex min-h-9 cursor-pointer items-center px-3 text-xs">
                          {uploadingReceiptId === r.id ? 'Uploaden…' : 'Galerij'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingReceiptId === r.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null
                              void onUploadReceipt(r.id, file)
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                        {(receiptsByExpenseId[r.id] ?? []).length === 0 ? (
                          <span className="text-xs text-slate-500">Geen foto</span>
                        ) : (
                          <ul className="list-none space-y-1.5 p-0">
                            {(receiptsByExpenseId[r.id] ?? []).map((rec, idx) => (
                              <li key={rec.id} className="flex flex-wrap items-center gap-2">
                                <a
                                  href={rec.image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold text-slate-700 underline"
                                >
                                  Bekijk
                                  {(receiptsByExpenseId[r.id] ?? []).length > 1 ? ` ${idx + 1}` : ''}
                                </a>
                                {user?.is_admin ? (
                                  <button
                                    type="button"
                                    onClick={() => void onDeleteReceipt(r.id, rec.id)}
                                    className="text-xs font-semibold text-red-700 hover:text-red-900"
                                  >
                                    Verwijderen
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                    {user?.is_admin ? (
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onDelete(r.id)}
                          className="text-sm font-semibold text-red-700 hover:text-red-900"
                        >
                          Verwijderen
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
