import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as api from '../api'
import { useAuth } from '../useAuth'
import { queryKeys } from '../queryKeys'
import {
  formatDateTimeNL,
  formatDelta,
  transactionIsUndoable,
  transactionReasonLabel,
} from '../utils/cardTransactionLabels'
import { useAlertDialog } from './useAlertDialog'

type Props = {
  cardId: number
  /** Wordt aangeroepen na een geslaagde terugdraaiactie, zodat de ouder saldo's kan verversen. */
  onChanged?: () => void | Promise<void>
}

/** Knipje-logboek van één kaart, met terugdraaien voor kraam/admin. */
export function CardHistoryPanel({ cardId, onChanged }: Props) {
  const { csrf } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<number | null>(null)

  const historyQuery = useQuery({
    queryKey: queryKeys.member.cardTransactions(cardId),
    queryFn: () => api.getCardTransactions(cardId),
  })

  async function onUndo(t: api.CardTransaction) {
    const extra =
      t.reason === 'avondeten_meal'
        ? ' De avondetenregistratie wordt verwijderd.'
        : t.reason === 'tosti_delivered'
          ? ' De bestelling blijft als geleverd staan; alleen de knipjes gaan terug.'
          : ''
    const ok = await confirm({
      title: 'Boeking terugdraaien?',
      message: `${transactionReasonLabel(t.reason)} (${formatDelta(t.delta)}) terugdraaien?${extra}`,
      confirmLabel: 'Ja, terugdraaien',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(t.id)
    try {
      await api.undoCardTransaction(csrf, t.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.member.cardTransactions(cardId) })
      await onChanged?.()
      await alert({ title: 'Teruggedraaid', message: 'Het saldo is hersteld.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Terugdraaien mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  if (historyQuery.isPending) {
    return <p className="text-sm text-slate-500">Historie laden…</p>
  }
  if (historyQuery.isError) {
    return (
      <p className="text-sm text-amber-800">
        Historie laden mislukt.{' '}
        <button type="button" onClick={() => void historyQuery.refetch()} className="font-semibold underline">
          Opnieuw
        </button>
      </p>
    )
  }
  const { transactions: rows, can_undo: canUndo } = historyQuery.data
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Nog geen boekingen op deze kaart.</p>
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
      {rows.map((t) => {
        const undone = t.reversed_by_transaction_id !== null
        const showUndo = canUndo && transactionIsUndoable(t.reason) && !undone && t.delta !== 0
        return (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${undone ? 'opacity-60' : ''}`}
          >
            <span
              className={`w-10 shrink-0 text-right font-mono font-semibold tabular-nums ${
                t.delta < 0 ? 'text-rose-700' : t.delta > 0 ? 'text-brand-700' : 'text-slate-500'
              }`}
            >
              {formatDelta(t.delta)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`font-medium text-slate-900 ${undone ? 'line-through' : ''}`}>
                {transactionReasonLabel(t.reason)}
                {t.avondeten_meal_date ? ` · ${t.avondeten_meal_date}` : ''}
              </span>
              <span className="block text-xs text-slate-500">
                {formatDateTimeNL(t.created_at)}
                {t.actor_name ? ` · door ${t.actor_name}` : ''}
                {t.balance_after !== null ? ` · saldo ${t.balance_after}` : ''}
                {t.note ? ` · ${t.note}` : ''}
                {undone ? ' · teruggedraaid' : ''}
              </span>
            </span>
            {showUndo ? (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void onUndo(t)}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === t.id ? '…' : 'Terugdraaien'}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
