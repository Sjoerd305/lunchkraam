import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type * as api from '../../api'

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shopExpensePurposeLabel(p: api.ShopExpensePurpose): string {
  return p === 'avondeten' ? 'Avondeten' : 'Lunchkraam'
}

export function shopExpenseKindLabel(row: api.AdminShopExpense): string {
  if (row.amount_eur < 0) return 'Bij kas'
  if (row.payment_channel === 'digitaal') return 'Digitaal'
  return 'Contant'
}

export function shopExpenseKindBadgeClass(row: api.AdminShopExpense): string {
  if (row.amount_eur < 0) {
    return 'rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900'
  }
  if (row.payment_channel === 'digitaal') {
    return 'rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900'
  }
  return 'rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800'
}

export function formatDateTimeShortNL(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

export function revolutSkipReasonLines(
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

export function revolutImportResultDetail(
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
