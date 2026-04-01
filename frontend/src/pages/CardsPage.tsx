import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { useAlertDialog } from '../components/AlertDialogProvider'

function cardKindLabel(kind: api.CardKind): string {
  return kind === 'avondeten' ? 'Avondetenkaart' : 'Tostikaart'
}

function cardKindBadgeClass(kind: api.CardKind): string {
  return kind === 'avondeten'
    ? 'rounded-md bg-amber-200 px-2 py-0.5 normal-case text-amber-950'
    : 'rounded-md bg-indigo-200 px-2 py-0.5 normal-case text-indigo-950'
}

export function CardsPage() {
  const { user, csrf, refresh } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [cards, setCards] = useState<api.Card[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const canUseManualKnipje = Boolean(user?.is_admin || user?.is_operator)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const list = await api.getCards()
      setCards(list)
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      setLoadFailed(true)
      setCards([])
      void alert({ title: 'Kaarten laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

  async function onUse(card: api.Card) {
    if (!canUseManualKnipje) {
      await alert({
        title: 'Geen toegang',
        message: 'Alleen admin of operator kan handmatig een knipje gebruiken.',
        variant: 'error',
      })
      return
    }
    const ok = await confirm({
      title: 'Knipje gebruiken?',
      message: 'Wil je 1 knipje afboeken?',
      confirmLabel: 'Ja, gebruiken',
      cancelLabel: 'Annuleren',
      tone: 'brand',
    })
    if (!ok) return
    setBusyId(card.id)
    try {
      await api.useKnipje(csrf, card.id)
      await load()
      await refresh()
      await alert({
        title: 'Smakelijk!',
        message: 'Je hebt een knipje gebruikt.',
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Mislukt.'
      await alert({ title: 'Kon geen knipje gebruiken', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !loadFailed) {
    return <p className="text-slate-600">Kaarten laden…</p>
  }

  if (loadFailed && cards.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Je kaarten konden niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-inner">
        <p className="text-slate-600">
          Je hebt nog geen kaarten.{' '}
          <Link to="/buy" className="font-semibold text-brand-700 underline">
            Vraag een kaart aan
          </Link>
          — knipjes zijn meteen bruikbaar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Mijn kaarten</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <article
            key={c.id}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Kaart #{c.id}</span>
              <span className={cardKindBadgeClass(c.kind)}>{cardKindLabel(c.kind)}</span>
              {c.source === 'physical' ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 normal-case text-amber-900">
                  Fysieke kaart (schatting)
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-3xl font-bold text-brand-800">
              {c.knipjes_remaining}
              <span className="text-lg font-medium text-slate-500"> / 10</span>
            </p>
            <p className="text-sm text-slate-600">knipjes over</p>
            <div className="mt-6 flex-1" />
            {c.knipjes_remaining > 0 ? (
              canUseManualKnipje ? (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void onUse(c)}
                  className="min-h-12 w-full rounded-xl bg-brand-700 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-800 disabled:opacity-50"
                >
                  {busyId === c.id ? 'Bezig…' : '1 knipje gebruiken'}
                </button>
              ) : null
            ) : (
              <p className="text-center text-sm text-slate-500">Deze kaart is op.</p>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
