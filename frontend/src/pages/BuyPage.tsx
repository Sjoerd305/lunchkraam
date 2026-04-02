import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { useAlertDialog } from '../components/useAlertDialog'

function cardKindLabel(kind: api.CardKind): string {
  return kind === 'avondeten' ? 'Avondetenkaart' : 'Tostikaart'
}

export function BuyPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [info, setInfo] = useState<api.BuyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [cancellingAll, setCancellingAll] = useState(false)

  const loadBuyInfo = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const b = await api.getBuyInfo()
      setInfo({
        ...b,
        my_pending_requests: b.my_pending_requests ?? [],
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      setLoadFailed(true)
      setInfo(null)
      void alert({ title: 'Laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void loadBuyInfo()
  }, [loadBuyInfo])

  const pending = info?.my_pending_requests ?? []
  const hasAnyPending = pending.length > 0
  const anyKnipjesUsed = pending.some((r) => r.knipjes_remaining < 10)
  const hasPendingTosti = pending.some((r) => r.kind === 'tosti')
  const hasPendingAvondeten = pending.some((r) => r.kind === 'avondeten')
  const showAvondeten = Boolean(user?.is_matroos_jeugd)

  async function onRequest(kind: api.CardKind) {
    if (kind === 'tosti' && hasPendingTosti) return
    if (kind === 'avondeten' && hasPendingAvondeten) return
    setSubmitting(true)
    try {
      await api.requestCard(csrf, kind)
      await refresh()
      await loadBuyInfo()
      const isAvondeten = kind === 'avondeten'
      await alert({
        title: 'Aanvraag ontvangen',
        message: isAvondeten
          ? 'Je kaart staat op Mijn kaarten. De beheerder accordeert later.'
          : 'Je tostikaart met 10 knipjes staat op Mijn kaarten; je kunt meteen bestellen. Beheerder accordeert later.',
        variant: 'success',
      })
    } catch (e) {
      if (e instanceof api.ApiError && e.code === 'already_pending') {
        await loadBuyInfo()
      }
      const msg = e instanceof api.ApiError ? e.message : 'Aanvraag mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function onCancelOne(id: number) {
    const ok = await confirm({
      title: 'Aanvraag annuleren?',
      message: 'Weet je zeker dat je deze aanvraag wilt annuleren?',
      confirmLabel: 'Ja, annuleren',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setCancellingId(id)
    try {
      await api.cancelMyRequest(csrf, id)
      await refresh()
      await loadBuyInfo()
      await alert({ title: 'Geannuleerd', message: 'De aanvraag is verwijderd uit de wachtrij.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Annuleren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setCancellingId(null)
    }
  }

  async function onCancelAll() {
    const ok = await confirm({
      title: 'Alle aanvragen annuleren?',
      message: `Alle ${pending.length} openstaande aanvragen annuleren? Dit kan niet ongedaan worden gemaakt.`,
      confirmLabel: 'Ja, alles annuleren',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setCancellingAll(true)
    try {
      const n = await api.cancelAllMyPendingRequests(csrf)
      await refresh()
      await loadBuyInfo()
      await alert({
        title: 'Geannuleerd',
        message:
          n === 1
            ? '1 aanvraag is geannuleerd.'
            : `${n} aanvragen zijn geannuleerd.`,
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Annuleren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setCancellingAll(false)
    }
  }

  if (loading && !loadFailed) {
    return <p className="text-slate-600">Laden…</p>
  }

  if (loadFailed && !info) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Deze pagina kon niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void loadBuyInfo()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (!info) {
    return null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Kaarten kopen</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-slate-900">Tostikaart (lunchkraam)</h2>
          <p className="mt-2 text-slate-700">
            Nieuwe kaart: <strong className="text-brand-800">€{info.payment_amount_eur}</strong>. Meteen{' '}
            <strong>10 knipjes</strong> op <strong>Mijn kaarten</strong>. Beheerder accordeert de betaling later.
          </p>
        </div>
        {showAvondeten ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Avondetenkaart (matroos jeugd)</h2>
            <p className="mt-2 text-slate-700">
              <strong className="text-brand-800">€{info.payment_amount_avondeten_eur}</strong> — 10 knipjes op Mijn
              kaarten. Afboeken via de kraam.
            </p>
          </div>
        ) : null}
      </div>

      {hasAnyPending ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-6 shadow-md">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-lg font-semibold text-amber-950">Jouw openstaande aanvragen</h2>
            {pending.length > 1 && !anyKnipjesUsed ? (
              <button
                type="button"
                disabled={cancellingAll || cancellingId !== null}
                onClick={() => void onCancelAll()}
                className="min-h-11 shrink-0 rounded-lg border border-amber-800/30 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {cancellingAll ? 'Bezig…' : `Annuleer alle (${pending.length})`}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-amber-900/90">
            Max. één open aanvraag per kaarttype. Annuleren alleen zonder knipjegebruik; daarna contact beheerder.
          </p>
          <ul className="mt-4 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-mono text-sm text-slate-600">#{r.id}</span>
                  <span className="ml-2 inline-block rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-800">
                    {cardKindLabel(r.kind)}
                  </span>
                  <span className="ml-2 text-sm text-slate-700">
                    {new Date(r.created_at).toLocaleString('nl-NL')}
                  </span>
                  <p className="mt-1 text-sm text-slate-600">
                    Knipjes op deze kaart:{' '}
                    <strong className="text-slate-800">{r.knipjes_remaining}</strong> / 10 over
                  </p>
                </div>
                {r.knipjes_remaining < 10 ? (
                  <p className="text-sm text-amber-900/90">
                    Annuleren niet mogelijk na knipjegebruik.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={cancellingId !== null || cancellingAll}
                    onClick={() => void onCancelOne(r.id)}
                    className="min-h-11 shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancellingId === r.id ? 'Bezig…' : 'Annuleren'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Betalen (Tikkie)</h2>
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Tostikaart (€{info.payment_amount_eur})</h3>
            {info.tikkie_url ? (
              <a
                href={info.tikkie_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
              >
                Tikkie tostikaart
              </a>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Nog geen Tikkie voor de tostikaart. Vraag een beheerder om de link in te stellen.
              </p>
            )}
          </div>
          {showAvondeten ? (
            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-800">
                Avondetenkaart (€{info.payment_amount_avondeten_eur})
              </h3>
              {info.tikkie_url_avondeten ? (
                <a
                  href={info.tikkie_url_avondeten}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex rounded-xl border-2 border-brand-700 bg-white px-5 py-3 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50"
                >
                  Tikkie avondeten
                </a>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Nog geen Tikkie voor de avondetenkaart. Vraag een beheerder om een aparte link in te stellen.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Overschrijven</h2>
        {info.bank_transfer_instructions ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
            {info.bank_transfer_instructions}
          </pre>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Er zijn nog geen overschrijvingsinstructies ingesteld. Vraag een beheerder als je per bank wilt betalen.
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Aanvragen</h2>
        <p className="mt-2 text-slate-600">
          Na betaling hier aanvragen — meteen een kaart op Mijn kaarten; beheerder ziet de wachtrij nog. Max.{' '}
          <strong>één open aanvraag per kaarttype</strong>.
        </p>
        {hasPendingTosti ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Je hebt al een open <strong>tosti</strong>-aanvraag. Annuleren alleen zonder knipjegebruik.
          </p>
        ) : null}
        <button
          type="button"
          disabled={submitting || hasPendingTosti}
          onClick={() => void onRequest('tosti')}
          className="mt-6 min-h-12 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Bezig…' : 'Ik heb betaald — online tostikaart aanvragen'}
        </button>
        {showAvondeten ? (
          <>
            {hasPendingAvondeten ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Je hebt al een openstaande <strong>avondeten</strong>-aanvraag — zie hierboven.
              </p>
            ) : null}
            <button
              type="button"
              disabled={submitting || hasPendingAvondeten}
              onClick={() => void onRequest('avondeten')}
              className="mt-4 min-h-12 w-full rounded-xl border-2 border-brand-700 bg-white px-5 py-3 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Bezig…' : 'Ik heb betaald — online avondetenkaart aanvragen'}
            </button>
          </>
        ) : null}
      </section>
    </div>
  )
}
