import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { queryKeys } from '../../queryKeys'
import { revolutImportResultDetail } from './adminShopExpensesHelpers'
import { AdminShopExpensesRevolutPanel } from './AdminShopExpensesRevolutPanel'

type Props = {
  /** Jaar van de Financiën-pagina; na een import worden de lijsten van dit jaar ververst. */
  year: number | null
  isOperatorOnly: boolean
}

/**
 * Revolut-saldo en CSV-import (Beheer → Financiën). Afschrijvingen uit de import worden uitgaven op
 * Boodschappen, bijschrijvingen worden bankregels die hieronder aan kaartverkopen gekoppeld worden.
 */
export function AdminRevolutImportSection({ year, isOperatorOnly }: Props) {
  const { csrf, user } = useAuth()
  const { alert } = useAlertDialog()
  const queryClient = useQueryClient()

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

  const revolutBalanceQuery = useQuery({
    queryKey: queryKeys.admin.revolutBalance(isOperatorOnly),
    queryFn: () => api.getRevolutBalance(isOperatorOnly),
    enabled: Boolean(user),
    retry: false,
  })

  const revolutBalance = revolutBalanceQuery.data ?? null
  const revolutBalanceLoading = revolutBalanceQuery.isFetching

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
          ? `${r.debits_pending_review} mogelijke duplica${r.debits_pending_review === 1 ? 'at' : 'ten'} in de wachtrij op Boodschappen.`
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
      if (!r.dry_run && (r.debits_imported > 0 || r.credits_imported > 0)) {
        // Uitgaven landen op Boodschappen, bijschrijvingen als bankregels hieronder en in de omzet.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.shopExpensesList(yearToRefresh, isOperatorOnly) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.bankCreditLists(yearToRefresh, isOperatorOnly) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.salesStats(yearToRefresh, isOperatorOnly) }),
          queryClient.invalidateQueries({ queryKey: ['admin', 'finance-control'] }),
        ])
      }
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Importeren mislukt.'
      await alert({ title: 'Revolut-import mislukt', message: msg, variant: 'error' })
    } finally {
      setRevolutSubmitting(false)
    }
  }

  return (
    <>
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

    </>
  )
}
