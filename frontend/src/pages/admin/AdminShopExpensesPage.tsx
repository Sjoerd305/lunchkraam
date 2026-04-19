import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useAdminSalesYearsSelect } from '../../hooks/useAdminSalesYearsSelect'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { adminYearSelectOptions } from '../../utils/adminYearSelectOptions'
import { revolutImportResultDetail, todayISO } from './adminShopExpensesHelpers'
import { AdminShopExpensesPendingReviews } from './AdminShopExpensesPendingReviews'
import { AdminShopExpensesRevolutPanel } from './AdminShopExpensesRevolutPanel'
import { AdminShopExpensesTable } from './AdminShopExpensesTable'
import type { ShopBookingKind, ShopExpensesListBundle } from './adminShopExpensesTypes'

export function AdminShopExpensesPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

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

  const { yearsQuery, year, setYear } = useAdminSalesYearsSelect({
    isOperatorOnly,
    enabled: Boolean(user),
    onYearsError: (msg) => void alert({ title: 'Jaren laden mislukt', message: msg, variant: 'error' }),
  })

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

  useQueryErrorAlert(listQuery, { title: 'Uitgaven laden mislukt', alert })

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
  const rows: api.AdminShopExpense[] = listQuery.data?.rows ?? []
  const receiptsByExpenseId: Record<number, api.ShopExpenseReceipt[]> =
    listQuery.data?.receiptsByExpenseId ?? {}
  const listLoading = listQuery.isFetching
  const revolutBalance = revolutBalanceQuery.data ?? null
  const revolutBalanceLoading = revolutBalanceQuery.isFetching
  const pendingReviews: api.PendingImportReview[] = pendingReviewsQuery.data ?? []

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

  const yearOptions = useMemo(
    () => adminYearSelectOptions(yearsQuery.data, year),
    [yearsQuery.data, year],
  )

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

      <AdminShopExpensesRevolutPanel
        revolutBalance={revolutBalance}
        revolutBalanceLoading={revolutBalanceLoading}
        revolutFile={revolutFile}
        onRevolutFileSelected={(file) => {
          setRevolutFile(file)
          setRevolutPreview(null)
          setExcludedDebit({})
          setExcludedCredit({})
        }}
        revolutPurpose={revolutPurpose}
        onRevolutPurposeChange={setRevolutPurpose}
        revolutCurrencyEUR={revolutCurrencyEUR}
        onRevolutCurrencyEURChange={setRevolutCurrencyEUR}
        revolutGuessPurposeByTime={revolutGuessPurposeByTime}
        onRevolutGuessPurposeByTimeChange={setRevolutGuessPurposeByTime}
        revolutSkipTypes={revolutSkipTypes}
        onRevolutSkipTypesChange={setRevolutSkipTypes}
        revolutFingerprint={revolutFingerprint}
        onRevolutFingerprintChange={setRevolutFingerprint}
        revolutCompletedOnly={revolutCompletedOnly}
        onRevolutCompletedOnlyChange={setRevolutCompletedOnly}
        revolutImportCredits={revolutImportCredits}
        onRevolutImportCreditsChange={setRevolutImportCredits}
        revolutCreditLunchEUR={revolutCreditLunchEUR}
        onRevolutCreditLunchEURChange={setRevolutCreditLunchEUR}
        revolutCreditAvondetenEUR={revolutCreditAvondetenEUR}
        onRevolutCreditAvondetenEURChange={setRevolutCreditAvondetenEUR}
        revolutDryRun={revolutDryRun}
        onRevolutDryRunChange={setRevolutDryRun}
        revolutPreviewLoading={revolutPreviewLoading}
        revolutSubmitting={revolutSubmitting}
        onRevolutPreview={() => void runRevolutPreview()}
        onRevolutImport={() => void runRevolutImport()}
        revolutPreview={revolutPreview}
        excludedDebit={excludedDebit}
        onExcludedDebitChange={(dk, included) => {
          setExcludedDebit((prev) => {
            const next = { ...prev }
            if (included) delete next[dk]
            else next[dk] = true
            return next
          })
        }}
        excludedCredit={excludedCredit}
        onExcludedCreditChange={(ck, included) => {
          setExcludedCredit((prev) => {
            const next = { ...prev }
            if (included) delete next[ck]
            else next[ck] = true
            return next
          })
        }}
        debitPurposeByKey={debitPurposeByKey}
        onDebitPurposeChange={(dk, v) => setDebitPurposeByKey((prev) => ({ ...prev, [dk]: v }))}
        creditPurposeByKey={creditPurposeByKey}
        onCreditPurposeChange={(ck, v) => setCreditPurposeByKey((prev) => ({ ...prev, [ck]: v }))}
        previewCreditSplit={previewCreditSplit}
      />

      <AdminShopExpensesPendingReviews
        pendingReviews={pendingReviews}
        reviewActioning={reviewActioning}
        onMergeReview={(id) => void onMergeReview(id)}
        onDismissReview={(id) => void onDismissReview(id)}
      />

      <AdminShopExpensesTable
        yearsLoading={yearsLoading}
        year={year}
        yearOptions={yearOptions}
        onYearChange={setYear}
        listLoading={listLoading}
        rows={rows}
        receiptsByExpenseId={receiptsByExpenseId}
        patchingPurposeId={patchingPurposeId}
        uploadingReceiptId={uploadingReceiptId}
        isAdmin={user?.is_admin}
        onPurposeChange={(id, p) => void onPurposeChange(id, p)}
        onUploadReceipt={(id, f) => void onUploadReceipt(id, f)}
        onDeleteReceipt={(eid, rid) => void onDeleteReceipt(eid, rid)}
        onDeleteExpense={(id) => void onDelete(id)}
      />
    </div>
  )
}
