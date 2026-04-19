import { Link } from 'react-router-dom'
import type * as api from '../../api'
import { formatDateTimeShortNL } from './adminShopExpensesHelpers'
import { formatEUR } from '../../utils/formatMoney'

export type AdminShopExpensesRevolutPanelProps = {
  revolutBalance: api.RevolutBalance | null
  revolutBalanceLoading: boolean
  revolutFile: File | null
  onRevolutFileSelected: (file: File | null) => void
  revolutPurpose: api.ShopExpensePurpose
  onRevolutPurposeChange: (purpose: api.ShopExpensePurpose) => void
  revolutCurrencyEUR: boolean
  onRevolutCurrencyEURChange: (onlyEur: boolean) => void
  revolutGuessPurposeByTime: boolean
  onRevolutGuessPurposeByTimeChange: (value: boolean) => void
  revolutSkipTypes: string
  onRevolutSkipTypesChange: (value: string) => void
  revolutFingerprint: boolean
  onRevolutFingerprintChange: (value: boolean) => void
  revolutCompletedOnly: boolean
  onRevolutCompletedOnlyChange: (value: boolean) => void
  revolutImportCredits: boolean
  onRevolutImportCreditsChange: (value: boolean) => void
  revolutCreditLunchEUR: string
  onRevolutCreditLunchEURChange: (value: string) => void
  revolutCreditAvondetenEUR: string
  onRevolutCreditAvondetenEURChange: (value: string) => void
  revolutDryRun: boolean
  onRevolutDryRunChange: (value: boolean) => void
  revolutPreviewLoading: boolean
  revolutSubmitting: boolean
  onRevolutPreview: () => void
  onRevolutImport: () => void
  revolutPreview: api.RevolutPreviewResponse | null
  excludedDebit: Record<string, boolean>
  onExcludedDebitChange: (rowKey: string, included: boolean) => void
  excludedCredit: Record<string, boolean>
  onExcludedCreditChange: (rowKey: string, included: boolean) => void
  debitPurposeByKey: Record<string, api.ShopExpensePurpose>
  onDebitPurposeChange: (rowKey: string, purpose: api.ShopExpensePurpose) => void
  creditPurposeByKey: Record<string, api.ShopExpensePurpose>
  onCreditPurposeChange: (rowKey: string, purpose: api.ShopExpensePurpose) => void
  previewCreditSplit: { lunch: number; avo: number; total: number } | null
}

export function AdminShopExpensesRevolutPanel(props: AdminShopExpensesRevolutPanelProps) {
  const {
    revolutBalance,
    revolutBalanceLoading,
    revolutFile,
    onRevolutFileSelected,
    revolutPurpose,
    onRevolutPurposeChange,
    revolutCurrencyEUR,
    onRevolutCurrencyEURChange,
    revolutGuessPurposeByTime,
    onRevolutGuessPurposeByTimeChange,
    revolutSkipTypes,
    onRevolutSkipTypesChange,
    revolutFingerprint,
    onRevolutFingerprintChange,
    revolutCompletedOnly,
    onRevolutCompletedOnlyChange,
    revolutImportCredits,
    onRevolutImportCreditsChange,
    revolutCreditLunchEUR,
    onRevolutCreditLunchEURChange,
    revolutCreditAvondetenEUR,
    onRevolutCreditAvondetenEURChange,
    revolutDryRun,
    onRevolutDryRunChange,
    revolutPreviewLoading,
    revolutSubmitting,
    onRevolutPreview,
    onRevolutImport,
    revolutPreview,
    excludedDebit,
    onExcludedDebitChange,
    excludedCredit,
    onExcludedCreditChange,
    debitPurposeByKey,
    onDebitPurposeChange,
    creditPurposeByKey,
    onCreditPurposeChange,
    previewCreditSplit,
  } = props

  return (
    <>
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
            onRevolutImport()
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">CSV-bestand</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="input-control mt-1.5"
              onChange={(e) => onRevolutFileSelected(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Standaard waarvoor</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Gebruikt als het tijdstip niet in het ochtend- of avondvenster valt (of als tijdherkenning uit staat).
            </span>
            <select
              value={revolutPurpose}
              onChange={(e) => onRevolutPurposeChange(e.target.value as api.ShopExpensePurpose)}
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
              onChange={(e) => onRevolutCurrencyEURChange(e.target.value === 'eur')}
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
              onChange={(e) => onRevolutGuessPurposeByTimeChange(e.target.checked)}
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
              onChange={(e) => onRevolutSkipTypesChange(e.target.value)}
              placeholder="bijv. TOPUP, EXCHANGE"
              className="input-control mt-1.5"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={revolutFingerprint}
              onChange={(e) => onRevolutFingerprintChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Vingerafdruk als er geen ID-kolom is
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={revolutCompletedOnly}
              onChange={(e) => onRevolutCompletedOnlyChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Alleen voltooide transacties (VOLTOOID / COMPLETED)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
            <input
              type="checkbox"
              checked={revolutImportCredits}
              onChange={(e) => onRevolutImportCreditsChange(e.target.checked)}
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
              onChange={(e) => onRevolutCreditLunchEURChange(e.target.value)}
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
              onChange={(e) => onRevolutCreditAvondetenEURChange(e.target.value)}
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
              onChange={(e) => onRevolutDryRunChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Alleen proefrun (niets opslaan)
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={revolutPreviewLoading || revolutSubmitting || !revolutFile}
              className="btn-secondary min-h-11 px-5"
              onClick={() => onRevolutPreview()}
            >
              {revolutPreviewLoading ? 'Voorbeeld…' : 'Voorbeeld tonen'}
            </button>
            <button
              type="button"
              disabled={revolutPreviewLoading || revolutSubmitting || !revolutFile}
              className="btn-primary min-h-11 px-5"
              onClick={() => onRevolutImport()}
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
                                onDebitPurposeChange(dk, v)
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
                              onChange={(e) => onExcludedDebitChange(dk, e.target.checked)}
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
                                onCreditPurposeChange(ck, v)
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
                              onChange={(e) => onExcludedCreditChange(ck, e.target.checked)}
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
    </>
  )
}
