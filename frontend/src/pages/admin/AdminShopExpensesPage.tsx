import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useAdminSalesYearsSelect } from '../../hooks/useAdminSalesYearsSelect'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { adminYearSelectOptions } from '../../utils/adminYearSelectOptions'
import { todayISO } from './adminShopExpensesHelpers'
import { AdminShopExpensesPendingReviews } from './AdminShopExpensesPendingReviews'
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
  const pendingReviews: api.PendingImportReview[] = pendingReviewsQuery.data ?? []

  const invalidateShopList = (y: number) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.shopExpensesList(y, isOperatorOnly) })

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Boodschappen &amp; uitgaven</h2>
        <p className="mt-2 text-slate-600">
          Boek boodschappen voor de lunchkraam en voor het avondeten (beide uit dezelfde omzet). Je kunt een{' '}
          <strong className="font-semibold text-slate-800">contante uitgave</strong>, een{' '}
          <strong className="font-semibold text-slate-800">digitale uitgave</strong> (bijv. pin; met bonfoto), of{' '}
          <strong className="font-semibold text-slate-800">los contant bij de kas</strong> boeken (verhoogt het saldo
          in het jaaroverzicht). Omzet = geaccordeerde kaartverkopen dit jaar; de kolom uitgaven op Overzicht is de
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
