import { useState } from 'react'
import { CardHistoryPanel } from '../../components/CardHistoryPanel'
import { cardKindBadgeClass, cardKindLabel } from './kraamFormat'
import type { OperatorCardRow } from '../../api'

type Props = {
  q: string
  onQueryChange: (q: string) => void
  loading: boolean
  rows: OperatorCardRow[]
  busyId: number | null
  onUseKnipje: (c: OperatorCardRow) => void
  /** Zet de schatting van een fysieke kaart; resolve na herladen van de lijst. */
  onSetEstimate: (c: OperatorCardRow, value: number) => Promise<void>
  /** Na een terugdraaiactie in de historie: saldo's verversen. */
  onHistoryChanged: () => Promise<void>
}

export function KraamCardSearchSection({
  q,
  onQueryChange,
  loading,
  rows,
  busyId,
  onUseKnipje,
  onSetEstimate,
  onHistoryChanged,
}: Props) {
  const [historyCardId, setHistoryCardId] = useState<number | null>(null)
  const [estimateEdit, setEstimateEdit] = useState<{ cardId: number; value: string } | null>(null)
  const [estimateSaving, setEstimateSaving] = useState(false)

  async function saveEstimate(c: OperatorCardRow) {
    if (!estimateEdit || estimateEdit.cardId !== c.id) return
    const value = Number(estimateEdit.value)
    if (!Number.isInteger(value) || value < 0 || value > 10) return
    setEstimateSaving(true)
    try {
      await onSetEstimate(c, value)
      setEstimateEdit(null)
    } finally {
      setEstimateSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Kaarten, knipje en historie</h2>
        <p className="text-sm text-slate-600">
          Zoek op kaartnummer, naam of e-mail. Boek handmatig een knipje af (tosti- én avondetenkaart), bekijk de historie
          of draai een boeking terug. Bij een fysieke kaart zet je de schatting direct op het aantal dat nog op de echte
          kaart staat.
        </p>
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Zoek op kaartnummer, naam of e-mail…"
        className="input-control min-h-11 max-w-md rounded-xl"
        aria-label="Zoek kaarten"
      />

      {loading && rows.length === 0 ? (
        <p className="text-slate-600">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Geen kaarten gevonden. Probeer een ander zoekwoord of laat leeg voor de nieuwste kaarten.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const physical = c.source === 'physical'
            const editing = estimateEdit?.cardId === c.id
            const historyOpen = historyCardId === c.id
            const estimateValue = editing ? Number(estimateEdit.value) : NaN
            const estimateValid = Number.isInteger(estimateValue) && estimateValue >= 0 && estimateValue <= 10
            return (
              <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-xs text-slate-500">
                      Kaart #{c.id} <span className={cardKindBadgeClass(c.kind)}>{cardKindLabel(c.kind)}</span>
                      {physical ? (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-amber-900">
                          Fysiek (schatting)
                        </span>
                      ) : null}
                    </p>
                    <p className="font-semibold text-slate-900">{c.owner_name}</p>
                    <p className="text-sm text-slate-600">{c.owner_email}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      <strong>{c.knipjes_remaining}</strong> / 10 knipjes
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {physical ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEstimateEdit(editing ? null : { cardId: c.id, value: String(c.knipjes_remaining) })
                        }
                        className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                        aria-expanded={editing}
                      >
                        Schatting zetten
                      </button>
                    ) : c.knipjes_remaining <= 0 ? (
                      <span className="text-sm text-slate-400">Op</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void onUseKnipje(c)}
                        className="min-h-11 shrink-0 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
                      >
                        {busyId === c.id ? 'Bezig…' : '1 knipje afboeken'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setHistoryCardId(historyOpen ? null : c.id)}
                      className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      aria-expanded={historyOpen}
                    >
                      {historyOpen ? 'Historie sluiten' : 'Historie'}
                    </button>
                  </div>
                </div>
                {editing && estimateEdit ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <label className="text-sm">
                      <span className="font-medium text-amber-950">Knipjes nog op de echte kaart</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={estimateEdit.value}
                        onChange={(e) => setEstimateEdit({ cardId: c.id, value: e.target.value })}
                        className="input-control mt-1 w-24"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={estimateSaving || !estimateValid}
                      onClick={() => void saveEstimate(c)}
                      className="btn-primary min-h-11"
                    >
                      {estimateSaving ? 'Opslaan…' : 'Opslaan'}
                    </button>
                    <button type="button" onClick={() => setEstimateEdit(null)} className="btn-secondary min-h-11">
                      Annuleren
                    </button>
                    <p className="basis-full text-xs text-amber-900/80">
                      Tel de knipjes op de fysieke kaart en vul in hoeveel er nog over zijn (0–10).
                    </p>
                  </div>
                ) : null}
                {historyOpen ? (
                  <div className="mt-3">
                    <CardHistoryPanel cardId={c.id} onChanged={onHistoryChanged} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
