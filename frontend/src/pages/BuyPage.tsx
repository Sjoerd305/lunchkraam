import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { useAlertDialog } from '../components/AlertDialogProvider'

export function BuyPage() {
  const { csrf, refresh } = useAuth()
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
  const hasPending = pending.length > 0
  const anyKnipjesUsed = pending.some((r) => r.knipjes_remaining < 10)

  async function onRequest() {
    if (hasPending) return
    setSubmitting(true)
    try {
      await api.requestCard(csrf)
      await refresh()
      await loadBuyInfo()
      await alert({
        title: 'Aanvraag ontvangen',
        message:
          'Je kaart met 10 knipjes staat nu op Mijn kaarten — je kunt meteen bestellen. De beheerder accordeert de betaling later voor de administratie.',
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
      <h1 className="text-2xl font-bold text-slate-900">Lunchkraam kaart kopen</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <p className="text-slate-700">
          Een nieuwe lunchkraam kaart kost{' '}
          <strong className="text-brand-800">€{info.payment_amount_eur}</strong>. Zodra je hieronder je
          aanvraag registreert, verschijnt er een <strong>volle kaart met 10 knipjes</strong> op{' '}
          <strong>Mijn kaarten</strong>. Zo kunnen bestellingen tijdens de verkoop doorgaan zonder dat een
          beheerder direct hoeft te accorderen. De beheerder vinkt de betaling later nog voor de
          administratie af.
        </p>
      </div>

      {hasPending ? (
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
            Je kunt geen nieuwe aanvraag doen zolang er minstens één openstaand is. Annuleer foutieve
            dubbelingen hier als je nog <strong>geen knipjes</strong> hebt gebruikt op die aanvraag. Na
            knipjegebruik kun je niet meer annuleren — neem dan contact op met de beheerder.
          </p>
          <ul className="mt-4 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-mono text-sm text-slate-600">#{r.id}</span>
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
        <h2 className="text-lg font-semibold text-slate-900">Betalen</h2>
        {info.tikkie_url ? (
          <a
            href={info.tikkie_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
          >
            Open Tikkie
          </a>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Er is nog geen Tikkie-link geconfigureerd. Vraag de beheerder om <code>TIKKIE_URL</code> in
            te stellen.
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Overschrijven</h2>
        {info.bank_transfer_instructions ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
            {info.bank_transfer_instructions}
          </pre>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Geen overschrijvingsinstructies geconfigureerd (<code>BANK_TRANSFER_INSTRUCTIONS</code>).
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">Aanvragen</h2>
        <p className="mt-2 text-slate-600">
          Na betaling registreer je hier je aanvraag: je krijgt meteen een kaart op Mijn kaarten. De
          beheerder ziet de aanvraag nog in de wachtrij voor betalingscontrole. Maximaal{' '}
          <strong>één</strong> openstaande aanvraag tegelijk.
        </p>
        {hasPending ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Je hebt al een openstaande aanvraag — zie hierboven. Annuleren kan alleen zolang je nog geen
            knipjes hebt gebruikt.
          </p>
        ) : null}
        <button
          type="button"
          disabled={submitting || hasPending}
          onClick={() => void onRequest()}
          className="mt-6 min-h-12 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Bezig…' : 'Ik heb betaald — kaart aanvragen'}
        </button>
      </section>
    </div>
  )
}
