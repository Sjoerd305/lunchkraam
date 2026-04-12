import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'

function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

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

function formatDateTimeShortNL(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

export function AdminShopExpensesPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const isOperatorOnly = useMemo(
    () => Boolean(user?.is_operator && !user?.is_admin),
    [user?.is_admin, user?.is_operator],
  )

  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [yearsLoading, setYearsLoading] = useState(true)
  const [rows, setRows] = useState<api.AdminShopExpense[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(todayISO)
  const [purpose, setPurpose] = useState<api.ShopExpensePurpose>('lunchkraam')
  const [description, setDescription] = useState('')
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [receiptsByExpenseId, setReceiptsByExpenseId] = useState<Record<number, api.ShopExpenseReceipt | null>>({})
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
  const [revolutImportCredits, setRevolutImportCredits] = useState(true)
  const [revolutGuessPurposeByTime, setRevolutGuessPurposeByTime] = useState(true)
  const [revolutCreditLunchEUR, setRevolutCreditLunchEUR] = useState('15')
  const [revolutCreditAvondetenEUR, setRevolutCreditAvondetenEUR] = useState('10')
  const [revolutBalance, setRevolutBalance] = useState<api.RevolutBalance | null>(null)
  const [revolutBalanceLoading, setRevolutBalanceLoading] = useState(false)

  const loadRevolutBalance = useCallback(async () => {
    if (!user) return
    setRevolutBalanceLoading(true)
    try {
      const b = await api.getRevolutBalance(isOperatorOnly)
      setRevolutBalance(b)
    } catch {
      setRevolutBalance(null)
    } finally {
      setRevolutBalanceLoading(false)
    }
  }, [user, isOperatorOnly])

  useEffect(() => {
    void loadRevolutBalance()
  }, [loadRevolutBalance])

  useEffect(() => {
    if (!user) return
    void (async () => {
      setYearsLoading(true)
      try {
        const ys = isOperatorOnly
          ? await api.getOperatorSalesYears()
          : await api.getAdminSalesYears()
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

  const loadList = useCallback(
    async (y: number) => {
      setListLoading(true)
      try {
        const list = isOperatorOnly
          ? await api.getOperatorShopExpenses(y)
          : await api.getAdminShopExpenses(y)
        setRows(list)
        const receiptEntries = await Promise.all(
          list.map(async (row) => {
            try {
              const receipt = await api.getShopExpenseReceipt(row.id, isOperatorOnly)
              return [row.id, receipt] as const
            } catch {
              return [row.id, null] as const
            }
          }),
        )
        setReceiptsByExpenseId(Object.fromEntries(receiptEntries))
      } catch (e) {
        setRows([])
        setReceiptsByExpenseId({})
        const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
        void alert({ title: 'Uitgaven laden mislukt', message: msg, variant: 'error' })
      } finally {
        setListLoading(false)
      }
    },
    [alert, isOperatorOnly],
  )

  useEffect(() => {
    if (year === null) return
    void loadList(year)
  }, [year, loadList])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (year === null) return
    if (!newReceiptFile) {
      void alert({
        title: 'Bonfoto verplicht',
        message: 'Selecteer eerst een bonfoto voordat je de uitgave toevoegt.',
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
      const body = { amount_eur: n, spent_on: spentOn, description: description.trim(), purpose }
      const createdExpense = isOperatorOnly
        ? await api.createOperatorShopExpense(csrf, body)
        : await api.createShopExpense(csrf, body)
      await api.uploadShopExpenseReceipt(csrf, createdExpense.id, newReceiptFile, isOperatorOnly)
      setAmount('')
      setDescription('')
      setPurpose('lunchkraam')
      setSpentOn(todayISO())
      setNewReceiptFile(null)
      await loadList(year)
      void alert({ title: 'Opgeslagen', message: 'Uitgave is toegevoegd.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const yearOptions = useMemo(() => {
    const yNow = new Date().getFullYear()
    const base = years.length > 0 ? [...years] : year !== null ? [year] : [yNow]
    const s = new Set(base)
    s.add(yNow)
    return Array.from(s).sort((a, b) => b - a)
  }, [years, year])

  async function onPurposeChange(expenseId: number, nextPurpose: api.ShopExpensePurpose) {
    const prev = rows.find((x) => x.id === expenseId)
    if (!prev || prev.purpose === nextPurpose) return
    setRows((rs) => rs.map((row) => (row.id === expenseId ? { ...row, purpose: nextPurpose } : row)))
    setPatchingPurposeId(expenseId)
    try {
      const updated = await api.patchShopExpensePurpose(csrf, expenseId, nextPurpose, isOperatorOnly)
      setRows((rs) => rs.map((row) => (row.id === expenseId ? updated : row)))
    } catch (err) {
      setRows((rs) => rs.map((row) => (row.id === expenseId ? { ...row, purpose: prev.purpose } : row)))
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
      await loadList(year)
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
      setReceiptsByExpenseId((prev) => ({ ...prev, [expenseId]: receipt }))
      await alert({ title: 'Bonfoto opgeslagen', message: 'De bonfoto is toegevoegd.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Uploaden mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setUploadingReceiptId(null)
    }
  }

  async function onDeleteReceipt(expenseId: number) {
    if (year === null) return
    const ok = await confirm({
      title: 'Bonfoto verwijderen?',
      message: 'Dit kan niet ongedaan worden gemaakt.',
      tone: 'danger',
      confirmLabel: 'Verwijderen',
    })
    if (!ok) return
    try {
      await api.deleteShopExpenseReceipt(csrf, expenseId)
      setReceiptsByExpenseId((prev) => ({ ...prev, [expenseId]: null }))
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Verwijderen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    }
  }

  function onNewReceiptFileSelected(file: File | null) {
    setNewReceiptFile(file)
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
      const r = await api.importRevolutShopExpenses(csrf, fd, isOperatorOnly)
      const debitLine = r.dry_run
        ? `Uitgaven (proef): ${r.debits_imported} geïmporteerd, ${r.debits_skipped} overgeslagen.`
        : `Uitgaven: ${r.debits_imported} geïmporteerd of bijgewerkt, ${r.debits_skipped} overgeslagen.`
      const creditLine =
        r.credits_enabled &&
        (r.dry_run
          ? `Inkomsten (proef): ${r.credits_imported} zouden worden geboekt, ${r.credits_skipped} overgeslagen.`
          : `Inkomsten: ${r.credits_imported} geboekt, ${r.credits_skipped} overgeslagen.`)
      const msg = creditLine ? `${debitLine}\n${creditLine}` : debitLine
      await alert({ title: r.dry_run ? 'Proefrun' : 'Revolut-import', message: msg, variant: 'success' })
      if (!r.dry_run) void loadRevolutBalance()
      if (!r.dry_run && (r.debits_imported > 0 || r.credits_imported > 0)) await loadList(yearToRefresh)
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
          Boek boodschappen voor de lunchkraam en voor het avondeten (beide uit dezelfde omzet). Omzet = geaccordeerde
          kaartverkopen dit jaar; uitgaven = alle geboekte boodschappen dit jaar.
          {isOperatorOnly ? ' Verkochte tosti’s op basis van levermoment.' : ''}
        </p>
      </div>

      <section className="surface-card">
        <h3 className="text-sm font-semibold text-slate-800">Nieuwe uitgave</h3>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <span className="font-medium text-slate-700">Bonfoto (verplicht)</span>
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
              disabled={submitting || year === null || !newReceiptFile}
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
          kaartverkopen.
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
              onChange={(e) => setRevolutFile(e.target.files?.[0] ?? null)}
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
              disabled={revolutSubmitting || !revolutFile}
              className="btn-primary min-h-11 px-5"
              onClick={() => void runRevolutImport()}
            >
              {revolutSubmitting ? 'Bezig…' : revolutDryRun ? 'Proefrun' : 'Importeren'}
            </button>
          </div>
        </form>
      </section>

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
            Geen uitgaven in {year ?? 'dit jaar'}.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Datum</th>
                  <th className="py-2 pr-4">Bedrag</th>
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
                        {receiptsByExpenseId[r.id] ? (
                          <>
                            <a
                              href={receiptsByExpenseId[r.id]?.image_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-slate-700 underline"
                            >
                              Bekijk
                            </a>
                            {user?.is_admin ? (
                              <button
                                type="button"
                                onClick={() => void onDeleteReceipt(r.id)}
                                className="text-xs font-semibold text-red-700 hover:text-red-900"
                              >
                                Verwijder foto
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">Geen foto</span>
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
